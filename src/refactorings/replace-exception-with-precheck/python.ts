import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import type { PreconditionResult, RefactoringResult } from "../../core/refactoring.types.js";
import { definePythonRefactoring, pythonParam } from "../../python/python-refactoring-builder.js";
import type { PythonProjectContext } from "../../python/python-refactoring-builder.js";

export const replaceExceptionWithPrecheckPython = definePythonRefactoring({
  name: "Replace Exception With Precheck (Python)",
  kebabName: "replace-exception-with-precheck-python",
  tier: 2,
  description: "Replaces a try/except block with an if-check before the operation (EAFP → LBYL).",
  params: [
    pythonParam.file(),
    pythonParam.identifier("target", "Name of the function containing the try/except to replace"),
    pythonParam.string(
      "condition",
      "Boolean expression for the precheck (e.g. 'key in data', 'value > 0')",
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
    const condition = params["condition"] as string;

    const filePath = path.resolve(ctx.projectRoot, file);

    let source: string;
    try {
      source = readFileSync(filePath, "utf-8");
    } catch {
      return { success: false, filesChanged: [], description: `File not found: ${file}` };
    }

    const result = replaceExceptionWithPrecheck(source, target, condition);

    if (!result.success) {
      return { success: false, filesChanged: [], description: result.error };
    }

    writeFileSync(filePath, result.newSource, "utf-8");

    return {
      success: true,
      filesChanged: [file],
      description: `Replaced try/except with precheck '${condition}' in function '${target}'`,
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

# Check for try/except blocks in the function
has_try_except = False
for node in ast.walk(target_func):
    if isinstance(node, ast.Try) and node.handlers:
        has_try_except = True
        break

if not has_try_except:
    print(json.dumps({"valid": False, "error": f"Function '{target}' does not contain any try/except blocks"}))
else:
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

function replaceExceptionWithPrecheck(
  source: string,
  target: string,
  condition: string,
): TransformResult {
  const script = `
import ast
import sys
import json

source = sys.stdin.read()
target = ${JSON.stringify(target)}
condition = ${JSON.stringify(condition)}

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

# Find the first try/except block in the function body
try_node = None
for stmt in target_func.body:
    if isinstance(stmt, ast.Try) and stmt.handlers:
        try_node = stmt
        break

if try_node is None:
    print(json.dumps({"success": False, "error": f"No try/except block found in '{target}'"}))
    sys.exit(0)

# Get the indentation of the try statement
try_line = lines[try_node.lineno - 1]
indent = ""
for ch in try_line:
    if ch in (" ", "\\t"):
        indent += ch
    else:
        break

# Get the body indentation (one level deeper)
body_indent = indent + "    "

# Extract the try body text (statements inside try:)
def get_stmt_text(stmt, lines, target_indent):
    """Extract text for a statement, re-indented to target_indent."""
    start = stmt.lineno - 1
    end = stmt.end_lineno
    stmt_lines = lines[start:end]
    if not stmt_lines:
        return ""
    # Find original indent
    orig_indent = ""
    for ch in stmt_lines[0]:
        if ch in (" ", "\\t"):
            orig_indent += ch
        else:
            break
    # Re-indent
    result = []
    for sl in stmt_lines:
        if sl.strip() == "":
            result.append("\\n")
        elif sl.startswith(orig_indent):
            result.append(target_indent + sl[len(orig_indent):])
        else:
            result.append(target_indent + sl.lstrip())
    return "".join(result)

# Build the try body text (re-indented to body_indent)
try_body_parts = []
for stmt in try_node.body:
    try_body_parts.append(get_stmt_text(stmt, lines, body_indent))
try_body_text = "".join(try_body_parts)

# Build the except body text (re-indented to body_indent)
except_body_parts = []
if try_node.handlers:
    handler = try_node.handlers[0]
    for stmt in handler.body:
        except_body_parts.append(get_stmt_text(stmt, lines, body_indent))
except_body_text = "".join(except_body_parts)

# Build the replacement: if condition: <try body> else: <except body>
replacement = f"{indent}if {condition}:\\n"
replacement += try_body_text
replacement += f"{indent}else:\\n"
replacement += except_body_text

# Replace the try/except block
start_line = try_node.lineno - 1
end_line = try_node.end_lineno
lines[start_line:end_line] = [replacement]

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
