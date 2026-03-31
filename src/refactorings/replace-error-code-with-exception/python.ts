import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import type { PreconditionResult, RefactoringResult } from "../../core/refactoring.types.js";
import { definePythonRefactoring, pythonParam } from "../../python/python-refactoring-builder.js";
import type { PythonProjectContext } from "../../python/python-refactoring-builder.js";

export const replaceErrorCodeWithExceptionPython = definePythonRefactoring({
  name: "Replace Error Code With Exception (Python)",
  kebabName: "replace-error-code-with-exception-python",
  tier: 2,
  description:
    "Replaces error code return values (negative numbers or None) with raised exceptions in a function.",
  params: [
    pythonParam.file(),
    pythonParam.identifier(
      "target",
      "Name of the function whose error code returns should be replaced with exceptions",
    ),
    pythonParam.string("exception", "Exception class name to raise (default: ValueError)", false),
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
    const exception = (params["exception"] as string | undefined) ?? "ValueError";

    const filePath = path.resolve(ctx.projectRoot, file);

    let source: string;
    try {
      source = readFileSync(filePath, "utf-8");
    } catch {
      return { success: false, filesChanged: [], description: `File not found: ${file}` };
    }

    const result = replaceErrorCodeWithException(source, target, exception);

    if (!result.success) {
      return { success: false, filesChanged: [], description: result.error };
    }

    writeFileSync(filePath, result.newSource, "utf-8");

    return {
      success: true,
      filesChanged: [file],
      description: `Replaced error code returns with '${exception}' exceptions in function '${target}'`,
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

# Check for error code returns (negative ints or None)
has_error_return = False
for node in ast.walk(target_func):
    if isinstance(node, ast.Return) and node.value is not None:
        val = node.value
        # Negative integer: UnaryOp(USub, Constant(int))
        if (isinstance(val, ast.UnaryOp) and isinstance(val.op, ast.USub)
                and isinstance(val.operand, ast.Constant) and isinstance(val.operand.value, int)):
            has_error_return = True
            break
        # None return
        if isinstance(val, ast.Constant) and val.value is None:
            has_error_return = True
            break

if not has_error_return:
    print(json.dumps({"valid": False, "error": f"Function '{target}' does not contain error code returns (negative integers or None)"}))
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

function replaceErrorCodeWithException(
  source: string,
  target: string,
  exception: string,
): TransformResult {
  const script = `
import ast
import sys
import json

source = sys.stdin.read()
target = ${JSON.stringify(target)}
exception_class = ${JSON.stringify(exception)}

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

# Find all error code return statements within the target function
edits = []
replaced = 0

for node in ast.walk(target_func):
    if not isinstance(node, ast.Return) or node.value is None:
        continue
    val = node.value
    is_error = False
    error_desc = ""

    # Negative integer: UnaryOp(USub, Constant(int))
    if (isinstance(val, ast.UnaryOp) and isinstance(val.op, ast.USub)
            and isinstance(val.operand, ast.Constant) and isinstance(val.operand.value, int)):
        is_error = True
        error_desc = f"Error code: {-val.operand.value}"

    # None return
    if isinstance(val, ast.Constant) and val.value is None:
        is_error = True
        error_desc = "Operation failed"

    if is_error:
        # Get the line containing this return statement
        line_idx = node.lineno - 1
        line = lines[line_idx]
        indent = ""
        for ch in line:
            if ch in (" ", "\\t"):
                indent += ch
            else:
                break

        # Build the raise statement
        raise_stmt = f"{indent}raise {exception_class}({json.dumps(error_desc)})\\n"
        edits.append((line_idx, node.end_lineno - 1, raise_stmt))
        replaced += 1

if replaced == 0:
    print(json.dumps({"success": False, "error": f"No error code returns found in '{target}'"}))
    sys.exit(0)

# Apply edits in reverse order
edits.sort(key=lambda e: e[0], reverse=True)
for start_line, end_line, replacement in edits:
    lines[start_line:end_line + 1] = [replacement]

new_source = "".join(lines)

print(json.dumps({
    "success": True,
    "newSource": new_source,
    "replaced": replaced,
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
