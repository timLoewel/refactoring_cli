import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import type { PreconditionResult, RefactoringResult } from "../../core/refactoring.types.js";
import { definePythonRefactoring, pythonParam } from "../../python/python-refactoring-builder.js";
import type { PythonProjectContext } from "../../python/python-refactoring-builder.js";

export const replaceQueryWithParameterPython = definePythonRefactoring({
  name: "Replace Query With Parameter (Python)",
  kebabName: "replace-query-with-parameter-python",
  tier: 2,
  description:
    "Replaces an internal computation (query expression) used inside a function with an explicit parameter, making the dependency visible.",
  params: [
    pythonParam.file(),
    pythonParam.identifier("target", "Name of the function to modify"),
    pythonParam.string("query", "The expression inside the function to replace with a parameter"),
    pythonParam.identifier("paramName", "Name for the new parameter"),
  ],
  preconditions(ctx: PythonProjectContext, params: Record<string, unknown>): PreconditionResult {
    const errors: string[] = [];
    const file = params["file"] as string;
    const target = params["target"] as string;
    const query = params["query"] as string;
    const paramName = params["paramName"] as string;

    const filePath = path.resolve(ctx.projectRoot, file);
    let source: string;
    try {
      source = readFileSync(filePath, "utf-8");
    } catch {
      errors.push(`File not found: ${file}`);
      return { ok: false, errors };
    }

    const result = validateFunction(source, target, query, paramName);
    if (!result.valid) {
      errors.push(result.error);
    }

    return { ok: errors.length === 0, errors };
  },
  apply(ctx: PythonProjectContext, params: Record<string, unknown>): RefactoringResult {
    const file = params["file"] as string;
    const target = params["target"] as string;
    const query = params["query"] as string;
    const paramName = params["paramName"] as string;

    const filePath = path.resolve(ctx.projectRoot, file);

    let source: string;
    try {
      source = readFileSync(filePath, "utf-8");
    } catch {
      return { success: false, filesChanged: [], description: `File not found: ${file}` };
    }

    const result = replaceQueryWithParameter(source, target, query, paramName);

    if (!result.success) {
      return { success: false, filesChanged: [], description: result.error };
    }

    writeFileSync(filePath, result.newSource, "utf-8");

    return {
      success: true,
      filesChanged: [file],
      description: `Replaced query '${query}' in '${target}' with new parameter '${paramName}'`,
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
  query: string,
  paramName: string,
): ValidateResult {
  const script = `
import ast
import sys
import json

source = sys.stdin.read()
target = ${JSON.stringify(target)}
query = ${JSON.stringify(query)}
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

# Check that the query expression exists in the function body
body_start = target_func.body[0].lineno
body_end = target_func.body[-1].end_lineno
body_lines = source.splitlines()[body_start - 1:body_end]
body_text = "\\n".join(body_lines)

if query not in body_text:
    print(json.dumps({"valid": False, "error": f"Expression '{query}' not found in body of '{target}'"}))
    sys.exit(0)

# Check that paramName doesn't already exist
all_params = (
    target_func.args.posonlyargs +
    target_func.args.args +
    target_func.args.kwonlyargs
)
for p in all_params:
    if p.arg == param_name:
        print(json.dumps({"valid": False, "error": f"Parameter '{param_name}' already exists in function '{target}'"}))
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

function replaceQueryWithParameter(
  source: string,
  target: string,
  query: string,
  paramName: string,
): TransformResult {
  const script = `
import ast
import sys
import json

source = sys.stdin.read()
target = ${JSON.stringify(target)}
query_expr = ${JSON.stringify(query)}
param_name = ${JSON.stringify(paramName)}

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

    # Build the current parameter list, then add the new parameter
    # We need to reconstruct the full parameter text

    def get_param_text(p, is_posonly=False, is_regular=False, is_kwonly=False):
        """Get the text representation of a parameter."""
        text = p.arg
        if p.annotation:
            ann_start = sum(len(lines[i]) for i in range(p.annotation.lineno - 1)) + p.annotation.col_offset
            ann_end = sum(len(lines[i]) for i in range(p.annotation.end_lineno - 1)) + p.annotation.end_col_offset
            text += ": " + source[ann_start:ann_end]

        # Check for default value
        if is_posonly or is_regular:
            all_regular = args.posonlyargs + args.args
            regular_idx = all_regular.index(p)
            default_idx = regular_idx - (len(all_regular) - len(args.defaults))
            if 0 <= default_idx < len(args.defaults):
                d = args.defaults[default_idx]
                d_start = sum(len(lines[i]) for i in range(d.lineno - 1)) + d.col_offset
                d_end = sum(len(lines[i]) for i in range(d.end_lineno - 1)) + d.end_col_offset
                text += "=" + source[d_start:d_end]
        elif is_kwonly:
            kw_idx = args.kwonlyargs.index(p)
            if kw_idx < len(args.kw_defaults) and args.kw_defaults[kw_idx] is not None:
                d = args.kw_defaults[kw_idx]
                d_start = sum(len(lines[i]) for i in range(d.lineno - 1)) + d.col_offset
                d_end = sum(len(lines[i]) for i in range(d.end_lineno - 1)) + d.end_col_offset
                text += "=" + source[d_start:d_end]
        return text

    param_parts = []

    for p in args.posonlyargs:
        param_parts.append(get_param_text(p, is_posonly=True))

    had_posonly = len(args.posonlyargs) > 0
    if had_posonly:
        param_parts.append("/")

    for p in args.args:
        param_parts.append(get_param_text(p, is_regular=True))

    # Determine where to place the new parameter.
    # If there are keyword-only params (after *), add it before * separator.
    # If there are positional-only params (before /), add it after / in the regular section.
    # Otherwise, add it at the end of regular params.
    # The new param goes in the regular (positional-or-keyword) section.
    param_parts.append(param_name)

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
        param_parts.append(get_param_text(p, is_kwonly=True))

    if args.kwarg:
        kw = args.kwarg
        text = "**" + kw.arg
        if kw.annotation:
            ann_start = sum(len(lines[i]) for i in range(kw.annotation.lineno - 1)) + kw.annotation.col_offset
            ann_end = sum(len(lines[i]) for i in range(kw.annotation.end_lineno - 1)) + kw.annotation.end_col_offset
            text += ": " + source[ann_start:ann_end]
        param_parts.append(text)

    new_params = ", ".join(param_parts)

    # Find opening and closing parens
    func_line = lines[func.lineno - 1]
    open_paren_col = func_line.index("(", func.col_offset)
    open_paren_offset = sum(len(lines[i]) for i in range(func.lineno - 1)) + open_paren_col

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

    edits.append((open_paren_offset + 1, close_paren_offset, new_params))

    # Replace occurrences of the query expression in the function body with param_name
    body = func.body
    body_start_line = body[0].lineno - 1
    body_end_line = body[-1].end_lineno

    # Convert body to absolute offsets
    body_start_offset = sum(len(lines[i]) for i in range(body_start_line))
    body_end_offset = sum(len(lines[i]) for i in range(body_end_line))

    body_text = source[body_start_offset:body_end_offset]
    new_body_text = body_text.replace(query_expr, param_name)

    if body_text != new_body_text:
        edits.append((body_start_offset, body_end_offset, new_body_text))

# Update call sites — add the query expression as an argument
for call in call_sites:
    if not target_funcs:
        continue
    func = target_funcs[0]

    # Add the query expression as the last positional argument (before any keyword args)
    # Find the position to insert: after the last positional arg, before keyword args
    if call.args:
        # After the last positional arg
        last_pos = call.args[-1]
        insert_offset = sum(len(lines[i]) for i in range(last_pos.end_lineno - 1)) + last_pos.end_col_offset
        edits.append((insert_offset, insert_offset, ", " + query_expr))
    elif call.keywords:
        # No positional args but has keyword args — insert before first keyword
        first_kw = call.keywords[0]
        kw_offset = sum(len(lines[i]) for i in range(first_kw.lineno - 1)) + first_kw.col_offset
        edits.append((kw_offset, kw_offset, query_expr + ", "))
    else:
        # No args at all — insert inside parens
        # Find the opening paren of the call
        if isinstance(call.func, ast.Name):
            call_line = lines[call.func.lineno - 1]
            open_paren_col = call_line.index("(", call.func.col_offset)
            open_paren_offset = sum(len(lines[i]) for i in range(call.func.lineno - 1)) + open_paren_col
        elif isinstance(call.func, ast.Attribute):
            call_line = lines[call.func.end_lineno - 1]
            open_paren_col = call_line.index("(", call.func.end_col_offset)
            open_paren_offset = sum(len(lines[i]) for i in range(call.func.end_lineno - 1)) + open_paren_col
        else:
            continue
        edits.append((open_paren_offset + 1, open_paren_offset + 1, query_expr))

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
