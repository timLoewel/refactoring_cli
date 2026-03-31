import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import type { PreconditionResult, RefactoringResult } from "../../core/refactoring.types.js";
import { definePythonRefactoring, pythonParam } from "../../python/python-refactoring-builder.js";
import type { PythonProjectContext } from "../../python/python-refactoring-builder.js";

export const returnModifiedValuePython = definePythonRefactoring({
  name: "Return Modified Value (Python)",
  kebabName: "return-modified-value-python",
  tier: 2,
  description:
    "Changes a function that mutates a parameter to instead return the modified value, and updates call sites to capture the return.",
  params: [
    pythonParam.file(),
    pythonParam.identifier(
      "target",
      "Name of the function that mutates a parameter to be changed to return it",
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

    const result = returnModifiedValue(source, target);

    if (!result.success) {
      return { success: false, filesChanged: [], description: result.error };
    }

    writeFileSync(filePath, result.newSource, "utf-8");

    return {
      success: true,
      filesChanged: [file],
      description: `Changed '${target}' to return its first parameter and updated call sites`,
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

# Check function has at least one parameter
args = target_func.args
all_args = args.posonlyargs + args.args + args.kwonlyargs
if not all_args:
    print(json.dumps({"valid": False, "error": f"Function '{target}' has no parameters to return"}))
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

function returnModifiedValue(source: string, target: string): TransformResult {
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
for node in ast.walk(tree):
    if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
        if node.name == target:
            target_func = node
            break

if target_func is None:
    print(json.dumps({"success": False, "error": f"Function '{target}' not found"}))
    sys.exit(0)

# Get the first parameter name
args = target_func.args
all_args = args.posonlyargs + args.args + args.kwonlyargs
if not all_args:
    print(json.dumps({"success": False, "error": f"Function '{target}' has no parameters"}))
    sys.exit(0)

first_param = all_args[0].arg

# Determine body indentation
body = target_func.body
if not body:
    print(json.dumps({"success": False, "error": f"Function '{target}' has no body"}))
    sys.exit(0)

first_body_line = lines[body[0].lineno - 1]
body_indent = ""
for ch in first_body_line:
    if ch in (" ", "\\t"):
        body_indent += ch
    else:
        break

# Check if there's already an explicit return at the end
last_stmt = body[-1]
has_return = isinstance(last_stmt, ast.Return) and last_stmt.value is not None

# Collect edits (applied bottom-to-top)
edits = []

# 1. Add return statement at the end of the function body (if not already returning)
if not has_return:
    insert_line = last_stmt.end_lineno
    return_stmt = f"{body_indent}return {first_param}\\n"
    edits.append(("insert", insert_line, return_stmt))

# 2. Update the return type annotation if it's -> None or absent
func_line_idx = target_func.lineno - 1
func_line = lines[func_line_idx]

# If the function has a -> None annotation, change it to remove None
if target_func.returns is not None:
    ret_node = target_func.returns
    if isinstance(ret_node, ast.Constant) and ret_node.value is None:
        # Replace "-> None" with nothing (we'll rely on inference) or
        # just remove the -> None annotation
        ret_start = ret_node.col_offset
        # Find the "->" before the None
        # Search backward from ret_start for "->"
        line_text = lines[ret_node.lineno - 1]
        arrow_idx = line_text.rfind("->", 0, ret_start)
        if arrow_idx >= 0:
            # Remove from arrow to end of None, preserving the colon
            colon_idx = line_text.find(":", ret_node.end_col_offset)
            if colon_idx >= 0:
                new_line = line_text[:arrow_idx].rstrip() + line_text[colon_idx:]
                edits.append(("replace_line", ret_node.lineno - 1, new_line))

# 3. Find all call sites in the same file and update them
for node in ast.walk(tree):
    if isinstance(node, ast.Expr) and isinstance(node.value, ast.Call):
        call = node.value
        func_node = call.func
        # Check if this is a call to our target function
        if isinstance(func_node, ast.Name) and func_node.id == target:
            # This is a bare expression statement calling target(args...)
            # Transform: target(arg, ...) → arg = target(arg, ...)
            if call.args:
                first_arg_text = ast.get_source_segment(source, call.args[0])
                call_text = ast.get_source_segment(source, call)
                if first_arg_text and call_text:
                    stmt_line = lines[node.lineno - 1]
                    stmt_indent = ""
                    for ch in stmt_line:
                        if ch in (" ", "\\t"):
                            stmt_indent += ch
                        else:
                            break
                    new_text = f"{stmt_indent}{first_arg_text} = {call_text}\\n"
                    edits.append(("replace_range", node.lineno - 1, node.end_lineno, new_text))

# Apply edits bottom-to-top
edits.sort(key=lambda e: e[1] if e[0] != "replace_range" else e[1], reverse=True)

for edit in edits:
    if edit[0] == "insert":
        _, line_idx, text = edit
        lines.insert(line_idx, text)
    elif edit[0] == "replace_line":
        _, line_idx, text = edit
        lines[line_idx] = text
    elif edit[0] == "replace_range":
        _, start, end, text = edit
        lines[start:end] = [text]

new_source = "".join(lines)

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
