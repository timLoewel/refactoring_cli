import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import type { PreconditionResult, RefactoringResult } from "../../core/refactoring.types.js";
import { definePythonRefactoring, pythonParam } from "../../python/python-refactoring-builder.js";
import type { PythonProjectContext } from "../../python/python-refactoring-builder.js";
import { parsePython } from "../../python/tree-sitter-parser.js";

export const inlinePythonFunction = definePythonRefactoring({
  name: "Inline Function (Python)",
  kebabName: "inline-function-python",
  tier: 2,
  description:
    "Replaces all call sites of a function with the function's body and removes the declaration.",
  params: [pythonParam.file(), pythonParam.identifier("target", "Name of the function to inline")],
  preconditions(ctx: PythonProjectContext, params: Record<string, unknown>): PreconditionResult {
    const errors: string[] = [];
    const file = params["file"] as string;
    const target = params["target"] as string;

    const filePath = path.resolve(ctx.projectRoot, file);
    let source: string;
    try {
      source = readFileSync(filePath, "utf-8");
    } catch {
      errors.push(`File not found: ${file}`);
      return { ok: false, errors };
    }

    const tree = parsePython(source);
    if (!hasFunctionDef(tree.rootNode, target)) {
      errors.push(`Function '${target}' not found in ${file}`);
    }

    return { ok: errors.length === 0, errors };
  },
  apply(ctx: PythonProjectContext, params: Record<string, unknown>): RefactoringResult {
    const file = params["file"] as string;
    const target = params["target"] as string;

    const filePath = path.resolve(ctx.projectRoot, file);

    let source: string;
    try {
      source = readFileSync(filePath, "utf-8");
    } catch {
      return { success: false, filesChanged: [], description: `File not found: ${file}` };
    }

    const result = inlineFunction(source, target);

    if (!result.success) {
      return { success: false, filesChanged: [], description: result.error };
    }

    writeFileSync(filePath, result.newSource, "utf-8");

    return {
      success: true,
      filesChanged: [file],
      description: `Inlined function '${target}' at ${result.callCount} call site(s)`,
    };
  },
});

interface InlineResult {
  success: boolean;
  newSource: string;
  callCount: number;
  error: string;
}

function inlineFunction(source: string, target: string): InlineResult {
  const script = `
import ast
import sys
import json

source = sys.stdin.read()
target = ${JSON.stringify(target)}

def get_text(node):
    """Extract source text for an AST node."""
    start = sum(len(lines[j]) for j in range(node.lineno - 1)) + node.col_offset
    end = sum(len(lines[j]) for j in range(node.end_lineno - 1)) + node.end_col_offset
    return source[start:end]

def substitute_params(text, arg_map):
    """Replace parameter references in text with their argument values."""
    if not arg_map:
        return text
    try:
        expr_tree = ast.parse(text, mode='eval')
    except SyntaxError:
        try:
            expr_tree = ast.parse(text, mode='exec')
        except SyntaxError:
            result = text
            for pname, aval in sorted(arg_map.items(), key=lambda x: -len(x[0])):
                result = result.replace(pname, aval)
            return result

    names = []
    for node in ast.walk(expr_tree):
        if isinstance(node, ast.Name) and node.id in arg_map:
            names.append(node)
    if not names:
        return text

    result = text
    for name in sorted(names, key=lambda n: (n.lineno, n.col_offset), reverse=True):
        text_lines = text.splitlines(True)
        if not text_lines:
            continue
        start = sum(len(text_lines[i]) for i in range(name.lineno - 1)) + name.col_offset
        end = sum(len(text_lines[i]) for i in range(name.end_lineno - 1)) + name.end_col_offset
        result = result[:start] + arg_map[name.id] + result[end:]
    return result

try:
    tree = ast.parse(source)
except SyntaxError as e:
    print(json.dumps({"success": False, "error": f"Syntax error: {e}"}))
    sys.exit(0)

lines = source.splitlines(True)

# Find the target function definition at module level
func_def = None
for node in ast.iter_child_nodes(tree):
    if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name == target:
        func_def = node
        break

if func_def is None:
    print(json.dumps({"success": False, "error": f"Function '{target}' not found at module level"}))
    sys.exit(0)

# Refuse decorated functions
if func_def.decorator_list:
    names = []
    for d in func_def.decorator_list:
        names.append(get_text(d) if hasattr(d, 'lineno') else "(complex)")
    print(json.dumps({"success": False, "error": f"Cannot inline decorated function '{target}' (decorators: {', '.join(names)})"}))
    sys.exit(0)

# Refuse generators
for node in ast.walk(func_def):
    if isinstance(node, (ast.Yield, ast.YieldFrom)):
        print(json.dumps({"success": False, "error": f"Cannot inline generator function '{target}'"}))
        sys.exit(0)

# Refuse async
if isinstance(func_def, ast.AsyncFunctionDef):
    print(json.dumps({"success": False, "error": f"Cannot inline async function '{target}'"}))
    sys.exit(0)

# Collect function parameters with defaults
func_params = []
for arg in func_def.args.args:
    func_params.append({"name": arg.arg, "default": None})
defaults = func_def.args.defaults
offset = len(func_params) - len(defaults)
for i, d in enumerate(defaults):
    func_params[offset + i]["default"] = get_text(d)

# Extract body statement info
body_stmts = []
for stmt in func_def.body:
    info = {"text": get_text(stmt), "is_return": isinstance(stmt, ast.Return), "return_value": None}
    if isinstance(stmt, ast.Return) and stmt.value:
        info["return_value"] = get_text(stmt.value)
    body_stmts.append(info)

# Find all external call sites
class CallFinder(ast.NodeVisitor):
    def __init__(self):
        self.calls = []
    def visit_Call(self, node):
        if isinstance(node.func, ast.Name) and node.func.id == target:
            if node.lineno < func_def.lineno or node.lineno > func_def.end_lineno:
                self.calls.append(node)
        self.generic_visit(node)

finder = CallFinder()
finder.visit(tree)
calls = finder.calls

if not calls:
    print(json.dumps({"success": False, "error": f"No call sites found for '{target}'"}))
    sys.exit(0)

# Build replacements for each call site
replacements = []
for call in calls:
    # Map arguments to parameters
    arg_map = {}
    for i, arg in enumerate(call.args):
        if i < len(func_params):
            arg_map[func_params[i]["name"]] = get_text(arg)
    for kw in call.keywords:
        if kw.arg:
            arg_map[kw.arg] = get_text(kw.value)
    for p in func_params:
        if p["name"] not in arg_map and p["default"] is not None:
            arg_map[p["name"]] = p["default"]

    # Find the enclosing statement
    enclosing_stmt = None
    for node in ast.walk(tree):
        if not isinstance(node, (ast.Expr, ast.Assign, ast.AnnAssign, ast.Return, ast.AugAssign)):
            continue
        if not hasattr(node, 'lineno'):
            continue
        if node.lineno <= call.lineno and node.end_lineno >= call.end_lineno:
            for child in ast.walk(node):
                if child is call:
                    enclosing_stmt = node
                    break
    if enclosing_stmt is None:
        continue

    # Determine indentation
    stmt_line = lines[enclosing_stmt.lineno - 1]
    indent = " " * (len(stmt_line) - len(stmt_line.lstrip()))

    # Check if this is an assignment: result = target_func(args)
    is_assign = isinstance(enclosing_stmt, ast.Assign) and len(enclosing_stmt.targets) == 1
    assign_target = get_text(enclosing_stmt.targets[0]) if is_assign else None

    # Build inlined code
    inlined_lines = []
    for si, info in enumerate(body_stmts):
        if info["is_return"] and info["return_value"] is not None:
            ret_val = substitute_params(info["return_value"], arg_map)
            if assign_target:
                inlined_lines.append(f"{indent}{assign_target} = {ret_val}")
            else:
                inlined_lines.append(f"{indent}{ret_val}")
        elif info["is_return"] and info["return_value"] is None:
            if si < len(body_stmts) - 1:
                inlined_lines.append(f"{indent}pass")
        else:
            replaced = substitute_params(info["text"], arg_map)
            inlined_lines.append(f"{indent}{replaced}")

    replacement_text = "\\n".join(inlined_lines)
    replacements.append((enclosing_stmt.lineno, enclosing_stmt.end_lineno, replacement_text))

# Apply all changes (function removal + call replacements) bottom-to-top
func_start = func_def.decorator_list[0].lineno if func_def.decorator_list else func_def.lineno
func_end = func_def.end_lineno

changes = [("remove", func_start, func_end, None)]
for start_line, end_line, text in replacements:
    changes.append(("replace", start_line, end_line, [l + "\\n" for l in text.split("\\n")]))

changes.sort(key=lambda c: c[1], reverse=True)

result_lines = list(lines)
for change_type, start, end, data in changes:
    if change_type == "remove":
        del result_lines[start - 1:end]
        # Clean up trailing blank line
        if start - 1 < len(result_lines) and result_lines[start - 1:start] == ["\\n"]:
            if start - 2 >= 0 and result_lines[start - 2].endswith("\\n"):
                del result_lines[start - 1]
    else:
        result_lines[start - 1:end] = data

new_source = "".join(result_lines)
print(json.dumps({"success": True, "newSource": new_source, "callCount": len(calls)}))
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
      callCount?: number;
      error?: string;
    };

    if (!parsed.success) {
      return {
        success: false,
        newSource: "",
        callCount: 0,
        error: parsed.error ?? "Unknown error",
      };
    }

    return {
      success: true,
      newSource: parsed.newSource ?? source,
      callCount: parsed.callCount ?? 0,
      error: "",
    };
  } catch (err) {
    return {
      success: false,
      newSource: "",
      callCount: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function hasFunctionDef(
  node: {
    type: string;
    text: string;
    childCount: number;
    child: (i: number) => typeof node | null;
  },
  name: string,
): boolean {
  if (node.type === "function_definition") {
    // Check the function name (second child is the identifier)
    const nameNode = node.child(1);
    if (nameNode && nameNode.type === "identifier" && nameNode.text === name) return true;
  }
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child && hasFunctionDef(child, name)) return true;
  }
  return false;
}
