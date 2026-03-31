import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import type { PreconditionResult, RefactoringResult } from "../../core/refactoring.types.js";
import { definePythonRefactoring, pythonParam } from "../../python/python-refactoring-builder.js";
import type { PythonProjectContext } from "../../python/python-refactoring-builder.js";

export const moveStatementsIntoFunctionPython = definePythonRefactoring({
  name: "Move Statements Into Function (Python)",
  kebabName: "move-statements-into-function-python",
  tier: 3,
  description:
    "Moves a range of statements into an existing function body and removes them from the original location.",
  params: [
    pythonParam.file(),
    pythonParam.identifier("target", "Name of the function to move statements into"),
    pythonParam.number("startLine", "First line of statements to move (1-based)"),
    pythonParam.number("endLine", "Last line of statements to move (1-based)"),
  ],
  preconditions(ctx: PythonProjectContext, params: Record<string, unknown>): PreconditionResult {
    const errors: string[] = [];
    const file = params["file"] as string;
    const target = params["target"] as string;
    const startLine = params["startLine"] as number;
    const endLine = params["endLine"] as number;

    if (endLine < startLine) {
      errors.push("param 'endLine' must be >= 'startLine'");
    }

    const filePath = path.resolve(ctx.projectRoot, file);
    let source: string;
    try {
      source = readFileSync(filePath, "utf-8");
    } catch {
      errors.push(`File not found: ${file}`);
      return { ok: false, errors };
    }

    const result = validateMoveStatements(source, target, startLine, endLine);
    if (!result.valid) {
      errors.push(...result.errors);
    }

    return { ok: errors.length === 0, errors };
  },
  apply(ctx: PythonProjectContext, params: Record<string, unknown>): RefactoringResult {
    const file = params["file"] as string;
    const target = params["target"] as string;
    const startLine = params["startLine"] as number;
    const endLine = params["endLine"] as number;

    const filePath = path.resolve(ctx.projectRoot, file);

    let source: string;
    try {
      source = readFileSync(filePath, "utf-8");
    } catch {
      return { success: false, filesChanged: [], description: `File not found: ${file}` };
    }

    const result = transformMoveStatements(source, target, startLine, endLine);

    if (!result.success) {
      return { success: false, filesChanged: [], description: result.error };
    }

    writeFileSync(filePath, result.newSource, "utf-8");

    return {
      success: true,
      filesChanged: [file],
      description: `Moved statements from lines ${startLine}-${endLine} into function '${target}'`,
    };
  },
});

interface ValidateResult {
  valid: boolean;
  errors: string[];
}

function validateMoveStatements(
  source: string,
  target: string,
  startLine: number,
  endLine: number,
): ValidateResult {
  const script = `
import ast
import sys
import json

source = sys.stdin.read()
target = ${JSON.stringify(target)}
start_line = ${startLine}
end_line = ${endLine}

errors = []

try:
    tree = ast.parse(source)
except SyntaxError as e:
    print(json.dumps({"valid": False, "errors": [f"Syntax error: {e}"]}))
    sys.exit(0)

# Find the target function
target_func = None
for node in ast.walk(tree):
    if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
        if node.name == target:
            target_func = node
            break

if target_func is None:
    errors.append(f"Function '{target}' not found")

lines = source.splitlines()
total_lines = len(lines)
if start_line > total_lines:
    errors.append(f"startLine {start_line} exceeds file length {total_lines}")
if end_line > total_lines:
    errors.append(f"endLine {end_line} exceeds file length {total_lines}")

# Check that selected lines don't overlap with the target function
if target_func is not None:
    func_start = target_func.lineno
    func_end = target_func.end_lineno or target_func.lineno
    if not (end_line < func_start or start_line > func_end):
        errors.append(f"Selected lines overlap with function '{target}'")

print(json.dumps({"valid": len(errors) == 0, "errors": errors}))
`;

  try {
    const output = execFileSync("python3", ["-c", script], {
      encoding: "utf-8",
      input: source,
      timeout: 10_000,
    }).trim();

    return JSON.parse(output) as ValidateResult;
  } catch (err) {
    return { valid: false, errors: [err instanceof Error ? err.message : String(err)] };
  }
}

interface TransformResult {
  success: boolean;
  newSource: string;
  error: string;
}

function transformMoveStatements(
  source: string,
  target: string,
  startLine: number,
  endLine: number,
): TransformResult {
  const script = `
import ast
import sys
import json
import textwrap

source = sys.stdin.read()
target = ${JSON.stringify(target)}
start_line = ${startLine}
end_line = ${endLine}

try:
    tree = ast.parse(source)
except SyntaxError as e:
    print(json.dumps({"success": False, "error": f"Syntax error: {e}"}))
    sys.exit(0)

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

# Extract the statements to move (1-based line numbers)
moved_lines = lines[start_line - 1:end_line]
if not moved_lines:
    print(json.dumps({"success": False, "error": f"No statements found between lines {start_line} and {end_line}"}))
    sys.exit(0)

# Determine the indentation of the function body
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

# Compute the indentation of the moved statements
moved_text = "".join(moved_lines)
dedented = textwrap.dedent(moved_text)
# Re-indent to match function body indentation
re_indented_lines = []
for line in dedented.splitlines(True):
    if line.strip():
        re_indented_lines.append(body_indent + line)
    else:
        re_indented_lines.append(line)

# Ensure each re-indented line ends with a newline
for i in range(len(re_indented_lines)):
    if re_indented_lines[i] and not re_indented_lines[i].endswith("\\n"):
        re_indented_lines[i] += "\\n"

# Find the insertion point: end of the function body
last_body_stmt = body[-1]
insert_line = last_body_stmt.end_lineno  # 1-based

func_end = target_func.end_lineno

if end_line < target_func.lineno:
    # Statements are BEFORE the function
    # First, remove the moved lines
    new_lines = lines[:start_line - 1] + lines[end_line:]
    # The function has shifted up by the number of removed lines
    shift = end_line - start_line + 1
    adjusted_insert = insert_line - shift
    # Insert the re-indented statements at the adjusted position
    final_lines = new_lines[:adjusted_insert] + re_indented_lines + new_lines[adjusted_insert:]
elif start_line > func_end:
    # Statements are AFTER the function
    # Insert re-indented statements at the end of the function body first
    inserted_count = len(re_indented_lines)
    new_lines = lines[:insert_line] + re_indented_lines + lines[insert_line:]
    # The moved statements have shifted down by the number of inserted lines
    adjusted_start = start_line + inserted_count
    adjusted_end = end_line + inserted_count
    # Remove the original lines
    final_lines = new_lines[:adjusted_start - 1] + new_lines[adjusted_end:]
else:
    print(json.dumps({"success": False, "error": "Selected lines overlap with the function"}))
    sys.exit(0)

new_source = "".join(final_lines)

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
