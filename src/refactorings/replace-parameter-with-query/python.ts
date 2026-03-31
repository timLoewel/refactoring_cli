import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import type { PreconditionResult, RefactoringResult } from "../../core/refactoring.types.js";
import { definePythonRefactoring, pythonParam } from "../../python/python-refactoring-builder.js";
import type { PythonProjectContext } from "../../python/python-refactoring-builder.js";

export const replaceParameterWithQueryPython = definePythonRefactoring({
  name: "Replace Parameter With Query (Python)",
  kebabName: "replace-parameter-with-query-python",
  tier: 2,
  description:
    "Removes a parameter that can be derived inside the function and replaces it with an internal query expression.",
  params: [
    pythonParam.file(),
    pythonParam.identifier("target", "Name of the function to modify"),
    pythonParam.identifier("param", "Name of the parameter to remove"),
    pythonParam.string("query", "Python expression to compute the parameter's value inside the function"),
  ],
  preconditions(ctx: PythonProjectContext, params: Record<string, unknown>): PreconditionResult {
    const errors: string[] = [];
    const file = params["file"] as string;
    const target = params["target"] as string;
    const paramName = params["param"] as string;

    const filePath = path.resolve(ctx.projectRoot, file);
    let source: string;
    try {
      source = readFileSync(filePath, "utf-8");
    } catch {
      errors.push(`File not found: ${file}`);
      return { ok: false, errors };
    }

    const result = validateFunction(source, target, paramName);
    if (!result.valid) {
      errors.push(result.error);
    }

    return { ok: errors.length === 0, errors };
  },
  apply(ctx: PythonProjectContext, params: Record<string, unknown>): RefactoringResult {
    const file = params["file"] as string;
    const target = params["target"] as string;
    const paramName = params["param"] as string;
    const query = params["query"] as string;

    const filePath = path.resolve(ctx.projectRoot, file);

    let source: string;
    try {
      source = readFileSync(filePath, "utf-8");
    } catch {
      return { success: false, filesChanged: [], description: `File not found: ${file}` };
    }

    const result = replaceParameterWithQuery(source, target, paramName, query);

    if (!result.success) {
      return { success: false, filesChanged: [], description: result.error };
    }

    writeFileSync(filePath, result.newSource, "utf-8");

    return {
      success: true,
      filesChanged: [file],
      description: `Removed parameter '${paramName}' from '${target}' and replaced with query '${query}'`,
    };
  },
});

interface ValidateResult {
  valid: boolean;
  error: string;
}

function validateFunction(
  source: string,
  target: string,
  paramName: string,
): ValidateResult {
  const script = `
import ast
import sys
import json

source = sys.stdin.read()
target = ${JSON.stringify(target)}
param_name = ${JSON.stringify(paramName)}

tree = ast.parse(source)

target_func = None
for node in ast.walk(tree):
    if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
        if node.name == target:
            target_func = node
            break

if target_func is None:
    print(json.dumps({"valid": False, "error": f"Function '{target}' not found"}))
    sys.exit(0)

# Check if parameter exists
all_params = (
    target_func.args.posonlyargs +
    target_func.args.args +
    target_func.args.kwonlyargs
)
found = False
for p in all_params:
    if p.arg == param_name:
        found = True
        break

if not found:
    print(json.dumps({"valid": False, "error": f"Parameter '{param_name}' not found in function '{target}'"}))
    sys.exit(0)

print(json.dumps({"valid": True, "error": ""}))
`;

  try {
    const output = execFileSync("python3", ["-c", script], {
      encoding: "utf-8",
      input: source,
      timeout: 10_000,
    }).trim();

    return JSON.parse(output) as ValidateResult;
  } catch (err) {
    return { valid: false, error: err instanceof Error ? err.message : String(err) };
  }
}

interface TransformResult {
  success: boolean;
  newSource: string;
  error: string;
}

function replaceParameterWithQuery(
  source: string,
  target: string,
  paramName: string,
  query: string,
): TransformResult {
  const script = `
import ast
import sys
import json

source = sys.stdin.read()
target = ${JSON.stringify(target)}
param_name = ${JSON.stringify(paramName)}
query_expr = ${JSON.stringify(query)}

tree = ast.parse(source)
lines = source.splitlines(True)

# Find all function definitions with the target name
target_funcs = []
for node in ast.walk(tree):
    if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
        if node.name == target:
            target_funcs.append(node)

if not target_funcs:
    print(json.dumps({"success": False, "error": f"Function '{target}' not found"}))
    sys.exit(0)

# Find all call sites for the target function
call_sites = []
for node in ast.walk(tree):
    if isinstance(node, ast.Call):
        if isinstance(node.func, ast.Name) and node.func.id == target:
            call_sites.append(node)
        elif isinstance(node.func, ast.Attribute) and node.func.attr == target:
            call_sites.append(node)

edits = []

for func in target_funcs:
    args = func.args
    all_params = args.posonlyargs + args.args + args.kwonlyargs

    # Find the parameter and its index
    param_idx = None
    param_node = None
    is_kwonly = False
    for i, p in enumerate(all_params):
        if p.arg == param_name:
            param_idx = i
            param_node = p
            is_kwonly = p in args.kwonlyargs
            break

    if param_idx is None:
        continue

    # Determine the positional index within args.args (for removing from call sites)
    # posonlyargs come first, then args, then kwonlyargs
    pos_index = None
    if param_node in args.posonlyargs:
        pos_index = args.posonlyargs.index(param_node)
    elif param_node in args.args:
        pos_index = len(args.posonlyargs) + args.args.index(param_node)
    # kwonly params are passed by keyword, so pos_index stays None

    # Remove the parameter from the function signature
    # We need to find the text range of the parameter (including annotation and default)
    # and remove it along with surrounding comma/whitespace

    # Build the full source range for the function's parameter list
    func_line = lines[func.lineno - 1]
    # Find opening paren
    open_paren_col = func_line.index("(", func.col_offset)
    open_paren_offset = sum(len(lines[i]) for i in range(func.lineno - 1)) + open_paren_col

    # Find closing paren by scanning from the end of the last param or body
    # Use the source text to find matching paren
    paren_depth = 0
    close_paren_offset = None
    for idx in range(open_paren_offset, len(source)):
        ch = source[idx]
        if ch == "(":
            paren_depth += 1
        elif ch == ")":
            paren_depth -= 1
            if paren_depth == 0:
                close_paren_offset = idx
                break

    if close_paren_offset is None:
        continue

    param_text = source[open_paren_offset + 1:close_paren_offset]

    # Parse the parameter list to find exact positions
    # Re-parse just the param string to find token boundaries
    # Instead, rebuild the param list without the target parameter
    # This is more robust than trying to calculate exact offsets

    # Collect all parameters with their text representations
    param_parts = []

    def get_param_text(p, defaults_list, defaults_offset):
        """Get the text representation of a parameter."""
        text = p.arg
        if p.annotation:
            ann_start = sum(len(lines[i]) for i in range(p.annotation.lineno - 1)) + p.annotation.col_offset
            ann_end = sum(len(lines[i]) for i in range(p.annotation.end_lineno - 1)) + p.annotation.end_col_offset
            text += ": " + source[ann_start:ann_end]

        # Check for default value
        idx_in_list = None
        if p in args.posonlyargs:
            idx_in_list = args.posonlyargs.index(p)
            # posonlyargs defaults are in args.defaults, but only for the last N
            # Actually defaults align to the END of posonlyargs + args
            all_regular = args.posonlyargs + args.args
            regular_idx = all_regular.index(p)
            default_idx = regular_idx - (len(all_regular) - len(args.defaults))
            if 0 <= default_idx < len(args.defaults):
                d = args.defaults[default_idx]
                d_start = sum(len(lines[i]) for i in range(d.lineno - 1)) + d.col_offset
                d_end = sum(len(lines[i]) for i in range(d.end_lineno - 1)) + d.end_col_offset
                text += "=" + source[d_start:d_end]
        elif p in args.args:
            all_regular = args.posonlyargs + args.args
            regular_idx = all_regular.index(p)
            default_idx = regular_idx - (len(all_regular) - len(args.defaults))
            if 0 <= default_idx < len(args.defaults):
                d = args.defaults[default_idx]
                d_start = sum(len(lines[i]) for i in range(d.lineno - 1)) + d.col_offset
                d_end = sum(len(lines[i]) for i in range(d.end_lineno - 1)) + d.end_col_offset
                text += "=" + source[d_start:d_end]
        elif p in args.kwonlyargs:
            kw_idx = args.kwonlyargs.index(p)
            if kw_idx < len(args.kw_defaults) and args.kw_defaults[kw_idx] is not None:
                d = args.kw_defaults[kw_idx]
                d_start = sum(len(lines[i]) for i in range(d.lineno - 1)) + d.col_offset
                d_end = sum(len(lines[i]) for i in range(d.end_lineno - 1)) + d.end_col_offset
                text += "=" + source[d_start:d_end]
        return text

    for p in args.posonlyargs:
        if p.arg != param_name:
            param_parts.append(get_param_text(p, args.defaults, 0))

    # Add / separator if there were positional-only params
    remaining_posonly = [p for p in args.posonlyargs if p.arg != param_name]
    had_posonly = len(args.posonlyargs) > 0

    if had_posonly and remaining_posonly:
        param_parts.append("/")

    for p in args.args:
        if p.arg != param_name:
            param_parts.append(get_param_text(p, args.defaults, 0))

    # Add * separator or *args
    if args.vararg:
        va = args.vararg
        text = "*" + va.arg
        if va.annotation:
            ann_start = sum(len(lines[i]) for i in range(va.annotation.lineno - 1)) + va.annotation.col_offset
            ann_end = sum(len(lines[i]) for i in range(va.annotation.end_lineno - 1)) + va.annotation.end_col_offset
            text += ": " + source[ann_start:ann_end]
        param_parts.append(text)
    elif args.kwonlyargs:
        param_parts.append("*")

    for p in args.kwonlyargs:
        if p.arg != param_name:
            param_parts.append(get_param_text(p, args.kw_defaults, 0))

    if args.kwarg:
        kw = args.kwarg
        text = "**" + kw.arg
        if kw.annotation:
            ann_start = sum(len(lines[i]) for i in range(kw.annotation.lineno - 1)) + kw.annotation.col_offset
            ann_end = sum(len(lines[i]) for i in range(kw.annotation.end_lineno - 1)) + kw.annotation.end_col_offset
            text += ": " + source[ann_start:ann_end]
        param_parts.append(text)

    # Handle case where / separator is left with nothing before it
    if param_parts and param_parts[0] == "/":
        param_parts.pop(0)

    new_params = ", ".join(param_parts)
    edits.append((open_paren_offset + 1, close_paren_offset, new_params))

    # Insert query assignment at the top of the function body
    body = func.body
    first_stmt = body[0]
    # Check if first statement is a docstring — if so, insert after it
    insert_after_idx = 0
    if (isinstance(first_stmt, ast.Expr) and
        isinstance(first_stmt.value, ast.Constant) and
        isinstance(first_stmt.value.value, str)):
        insert_after_idx = 1

    if insert_after_idx < len(body):
        insert_stmt = body[insert_after_idx]
    else:
        insert_stmt = first_stmt

    body_indent = ""
    insert_line = lines[insert_stmt.lineno - 1]
    for ch in insert_line:
        if ch in (" ", "\\t"):
            body_indent += ch
        else:
            break

    insert_offset = sum(len(lines[i]) for i in range(insert_stmt.lineno - 1))
    query_line = f"{body_indent}{param_name} = {query_expr}\\n"
    edits.append((insert_offset, insert_offset, query_line))

# Update call sites — remove the argument at the parameter's position
for call in call_sites:
    # Find which func definition matches (use first)
    if not target_funcs:
        continue
    func = target_funcs[0]
    args_obj = func.args

    # Find the param in the definition to determine its position
    all_regular = args_obj.posonlyargs + args_obj.args
    param_in_regular = None
    regular_idx = None
    for i, p in enumerate(all_regular):
        if p.arg == param_name:
            param_in_regular = p
            regular_idx = i
            break

    is_kwonly_param = param_name in [p.arg for p in args_obj.kwonlyargs]

    # Check keyword arguments first — remove if passed as keyword
    kw_removed = False
    for kw in call.keywords:
        if kw.arg == param_name:
            # Remove this keyword argument
            kw_start = sum(len(lines[i]) for i in range(kw.lineno - 1)) + kw.col_offset
            kw_end = sum(len(lines[i]) for i in range(kw.end_lineno - 1)) + kw.end_col_offset

            # Find the keyword name start by searching backward from value
            # kw.col_offset points to the key name
            # Also need to remove the surrounding comma
            all_call_nodes = list(call.args) + list(call.keywords)
            all_call_nodes.sort(key=lambda n: (n.lineno, n.col_offset))
            node_idx = None
            for ni, n in enumerate(all_call_nodes):
                if n is kw:
                    node_idx = ni
                    break

            if node_idx is not None:
                if node_idx == 0 and len(all_call_nodes) > 1:
                    # First arg, remove trailing comma+space
                    next_node = all_call_nodes[1]
                    next_start = sum(len(lines[i]) for i in range(next_node.lineno - 1)) + next_node.col_offset
                    # For keyword next node, the col_offset points to key name
                    edits.append((kw_start, next_start, ""))
                elif node_idx > 0:
                    # Not first arg, remove leading comma+space
                    prev_node = all_call_nodes[node_idx - 1]
                    prev_end = sum(len(lines[i]) for i in range(prev_node.end_lineno - 1)) + prev_node.end_col_offset
                    edits.append((prev_end, kw_end, ""))
                else:
                    # Only argument
                    edits.append((kw_start, kw_end, ""))
            kw_removed = True
            break

    if kw_removed:
        continue

    # Remove positional argument if applicable
    if regular_idx is not None and regular_idx < len(call.args):
        arg_node = call.args[regular_idx]
        arg_start = sum(len(lines[i]) for i in range(arg_node.lineno - 1)) + arg_node.col_offset
        arg_end = sum(len(lines[i]) for i in range(arg_node.end_lineno - 1)) + arg_node.end_col_offset

        all_call_args = list(call.args) + list(call.keywords)
        all_call_args.sort(key=lambda n: (n.lineno, n.col_offset))
        node_idx = None
        for ni, n in enumerate(all_call_args):
            if n is arg_node:
                node_idx = ni
                break

        if node_idx is not None:
            if node_idx == 0 and len(all_call_args) > 1:
                next_node = all_call_args[1]
                next_start = sum(len(lines[i]) for i in range(next_node.lineno - 1)) + next_node.col_offset
                edits.append((arg_start, next_start, ""))
            elif node_idx > 0:
                prev_node = all_call_args[node_idx - 1]
                prev_end = sum(len(lines[i]) for i in range(prev_node.end_lineno - 1)) + prev_node.end_col_offset
                edits.append((prev_end, arg_end, ""))
            else:
                edits.append((arg_start, arg_end, ""))

    # If the param had a default and wasn't passed at all, nothing to remove from call site

# Sort edits in reverse order to avoid offset shifting
edits.sort(key=lambda e: (e[0], e[1]), reverse=True)

new_source = source
for start, end, replacement in edits:
    new_source = new_source[:start] + replacement + new_source[end:]

print(json.dumps({
    "success": True,
    "newSource": new_source,
}))
`;

  try {
    const output = execFileSync("python3", ["-c", script], {
      encoding: "utf-8",
      input: source,
      timeout: 10_000,
    }).trim();

    const parsed = JSON.parse(output) as {
      success: boolean;
      newSource?: string;
      error?: string;
    };

    if (!parsed.success) {
      return { success: false, newSource: "", error: parsed.error ?? "Unknown error" };
    }

    return { success: true, newSource: parsed.newSource ?? source, error: "" };
  } catch (err) {
    return {
      success: false,
      newSource: "",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
