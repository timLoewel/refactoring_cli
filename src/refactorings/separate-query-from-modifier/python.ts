import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import type { PreconditionResult, RefactoringResult } from "../../core/refactoring.types.js";
import { definePythonRefactoring, pythonParam } from "../../python/python-refactoring-builder.js";
import type { PythonProjectContext } from "../../python/python-refactoring-builder.js";

export const separateQueryFromModifierPython = definePythonRefactoring({
  name: "Separate Query From Modifier (Python)",
  kebabName: "separate-query-from-modifier-python",
  tier: 2,
  description:
    "Splits a function that both returns a value and has side effects into a pure query function and a void modifier function.",
  params: [
    pythonParam.file(),
    pythonParam.identifier(
      "target",
      "Name of the function to split into query and modifier",
    ),
  ],
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

    const result = validateFunction(source, target);
    if (!result.valid) {
      errors.push(result.error);
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

    const result = separateQueryFromModifier(source, target);

    if (!result.success) {
      return { success: false, filesChanged: [], description: result.error };
    }

    writeFileSync(filePath, result.newSource, "utf-8");

    return {
      success: true,
      filesChanged: [file],
      description: `Split '${target}' into query and modifier functions`,
    };
  },
});

interface ValidateResult {
  valid: boolean;
  error: string;
}

function validateFunction(source: string, target: string): ValidateResult {
  const script = `
import ast
import sys
import json

source = sys.stdin.read()
target = ${JSON.stringify(target)}

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

# Must have a return statement with a value (query part)
has_return_value = False
for node in ast.walk(target_func):
    if isinstance(node, ast.Return) and node.value is not None:
        has_return_value = True
        break

if not has_return_value:
    print(json.dumps({"valid": False, "error": f"Function '{target}' has no return value; cannot separate query"}))
    sys.exit(0)

# Must have side effects (at least one non-return statement)
body = target_func.body
non_return = [s for s in body if not isinstance(s, ast.Return)]
if not non_return:
    print(json.dumps({"valid": False, "error": f"Function '{target}' has no side effects; it is already a pure query"}))
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

function separateQueryFromModifier(source: string, target: string): TransformResult {
  const script = `
import ast
import sys
import json

source = sys.stdin.read()
target = ${JSON.stringify(target)}

tree = ast.parse(source)
lines = source.splitlines(True)

# Find the target function
target_func = None
# Track whether it's a method (inside a class)
parent_class = None
for node in ast.walk(tree):
    if isinstance(node, ast.ClassDef):
        for item in node.body:
            if isinstance(item, (ast.FunctionDef, ast.AsyncFunctionDef)) and item.name == target:
                target_func = item
                parent_class = node
                break
    if target_func:
        break

if target_func is None:
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name == target:
            target_func = node
            break

if target_func is None:
    print(json.dumps({"success": False, "error": f"Function '{target}' not found"}))
    sys.exit(0)

body = target_func.body
is_method = parent_class is not None

# Determine indentation
first_body_line = lines[body[0].lineno - 1]
body_indent = ""
for ch in first_body_line:
    if ch in (" ", "\\t"):
        body_indent += ch
    else:
        break

# Determine the def-level indentation (one level above body)
func_line = lines[target_func.lineno - 1]
func_indent = ""
for ch in func_line:
    if ch in (" ", "\\t"):
        func_indent += ch
    else:
        break

# Separate return statements from side-effect statements
return_stmts = [s for s in body if isinstance(s, ast.Return) and s.value is not None]
side_effect_stmts = [s for s in body if not isinstance(s, ast.Return)]

if not return_stmts:
    print(json.dumps({"success": False, "error": f"Function '{target}' has no return value"}))
    sys.exit(0)

# Get the return expression from the first return statement
return_stmt = return_stmts[0]
return_expr_text = ast.get_source_segment(source, return_stmt.value)
if not return_expr_text:
    # Fallback: extract from source lines
    ret_line = lines[return_stmt.lineno - 1]
    return_idx = ret_line.find("return ")
    if return_idx >= 0:
        return_expr_text = ret_line[return_idx + 7:].strip()
    else:
        return_expr_text = "None"

# Build parameter list for new functions
args = target_func.args
all_params = []
param_names = []

# Collect all parameter representations
for arg in args.posonlyargs + args.args:
    name = arg.arg
    if is_method and name in ("self", "cls"):
        all_params.append(name)
        param_names.append(name)
        continue
    annotation = ""
    if arg.annotation:
        ann_text = ast.get_source_segment(source, arg.annotation)
        if ann_text:
            annotation = f": {ann_text}"
    all_params.append(f"{name}{annotation}")
    param_names.append(name)

for arg in args.kwonlyargs:
    name = arg.arg
    annotation = ""
    if arg.annotation:
        ann_text = ast.get_source_segment(source, arg.annotation)
        if ann_text:
            annotation = f": {ann_text}"
    all_params.append(f"{name}{annotation}")
    param_names.append(name)

param_str = ", ".join(all_params)
call_args = ", ".join(p for p in param_names if p not in ("self", "cls"))
if is_method and param_names and param_names[0] in ("self", "cls"):
    self_prefix = param_names[0]
else:
    self_prefix = None

# Get return type annotation if present
return_type = ""
if target_func.returns:
    ret_type_text = ast.get_source_segment(source, target_func.returns)
    if ret_type_text:
        return_type = f" -> {ret_type_text}"

# Build query function name and modifier function name
query_name = f"get_{target}"
modifier_name = f"do_{target}"

# Determine the async prefix
is_async = isinstance(target_func, ast.AsyncFunctionDef)
async_prefix = "async " if is_async else ""

# Build query function body
query_body = f"{body_indent}return {return_expr_text}"

# Build modifier function body
modifier_lines = []
for s in side_effect_stmts:
    start = s.lineno - 1
    end = s.end_lineno
    stmt_text = "".join(lines[start:end]).rstrip("\\n")
    # Re-indent to body_indent level
    stmt_lines = stmt_text.splitlines()
    for sl in stmt_lines:
        modifier_lines.append(sl)

modifier_body = "\\n".join(modifier_lines) if modifier_lines else f"{body_indent}pass"

# Build query function
query_fn = f"{func_indent}{async_prefix}def {query_name}({param_str}){return_type}:\\n{query_body}\\n"

# Build modifier function
modifier_fn = f"{func_indent}{async_prefix}def {modifier_name}({param_str}) -> None:\\n{modifier_body}\\n"

# Replace the original function body to call both
if is_method:
    if call_args:
        modifier_call = f"{body_indent}{self_prefix}.{modifier_name}({call_args})"
        query_call = f"{body_indent}return {self_prefix}.{query_name}({call_args})"
    else:
        modifier_call = f"{body_indent}{self_prefix}.{modifier_name}()"
        query_call = f"{body_indent}return {self_prefix}.{query_name}()"
else:
    if call_args:
        modifier_call = f"{body_indent}{modifier_name}({call_args})"
        query_call = f"{body_indent}return {query_name}({call_args})"
    else:
        modifier_call = f"{body_indent}{modifier_name}()"
        query_call = f"{body_indent}return {query_name}()"

new_body_text = f"{modifier_call}\\n{query_call}\\n"

# Replace body lines
body_start = body[0].lineno - 1
body_end = body[-1].end_lineno

new_lines = lines[:body_start] + [new_body_text] + lines[body_end:]

# Find where to insert the new functions (after the original function)
# The original function ends at target_func.end_lineno
func_end = target_func.end_lineno
# Adjust for the body replacement: new_lines has different length
offset = len(new_lines) - len(lines)
insert_pos = func_end + offset

# Insert the two new functions
insert_text = f"\\n{query_fn}\\n{modifier_fn}"
new_lines.insert(insert_pos, insert_text)

new_source = "".join(new_lines)

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
