import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import type { PreconditionResult, RefactoringResult } from "../../core/refactoring.types.js";
import { definePythonRefactoring, pythonParam } from "../../python/python-refactoring-builder.js";
import type { PythonProjectContext } from "../../python/python-refactoring-builder.js";

export const substituteAlgorithmPython = definePythonRefactoring({
  name: "Substitute Algorithm (Python)",
  kebabName: "substitute-algorithm-python",
  tier: 2,
  description: "Replaces the entire body of a function with a new implementation.",
  params: [
    pythonParam.file(),
    pythonParam.identifier("target", "Name of the function whose body should be replaced"),
    pythonParam.string("newBody", "New function body (indented Python code, one level of indentation)"),
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

    const result = validateSubstitution(source, target);
    if (!result.valid) {
      errors.push(result.error);
    }

    return { ok: errors.length === 0, errors };
  },
  apply(ctx: PythonProjectContext, params: Record<string, unknown>): RefactoringResult {
    const file = params["file"] as string;
    const target = params["target"] as string;
    const newBody = params["newBody"] as string;

    const filePath = path.resolve(ctx.projectRoot, file);

    let source: string;
    try {
      source = readFileSync(filePath, "utf-8");
    } catch {
      return { success: false, filesChanged: [], description: `File not found: ${file}` };
    }

    const result = substituteAlgorithmTransform(source, target, newBody);

    if (!result.success) {
      return { success: false, filesChanged: [], description: result.error };
    }

    writeFileSync(filePath, result.newSource, "utf-8");

    return {
      success: true,
      filesChanged: [file],
      description: `Replaced body of function '${target}' with the new algorithm`,
    };
  },
});

interface ValidateResult {
  valid: boolean;
  error: string;
}

function validateSubstitution(source: string, target: string): ValidateResult {
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

function substituteAlgorithmTransform(
  source: string,
  target: string,
  newBody: string,
): TransformResult {
  const script = `
import ast
import sys
import json

source = sys.stdin.read()
target = ${JSON.stringify(target)}
new_body = ${JSON.stringify(newBody)}

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

# Get the function body start and end lines
body = target_func.body
if not body:
    print(json.dumps({"success": False, "error": f"Function '{target}' has no body"}))
    sys.exit(0)

# Determine the indentation of the function body
first_body_line = lines[body[0].lineno - 1]
body_indent = ""
for ch in first_body_line:
    if ch in (" ", "\\t"):
        body_indent += ch
    else:
        break

# Handle docstring: if the first statement is a string expression, preserve it
docstring_end = None
if (isinstance(body[0], ast.Expr) and isinstance(body[0].value, (ast.Constant, ast.Str))):
    val = body[0].value
    if isinstance(getattr(val, 'value', None), str) or isinstance(val, ast.Str):
        docstring_end = body[0].end_lineno
        body_start_line = body[0].end_lineno  # body after docstring
    else:
        body_start_line = body[0].lineno - 1
else:
    body_start_line = body[0].lineno - 1

# The body ends at the last statement's end line
body_end_line = body[-1].end_lineno

# Re-indent the new body to match the function's body indentation
new_body_lines = new_body.splitlines()
# Strip common leading whitespace from new body
if new_body_lines:
    # Find minimum indentation (ignoring empty lines)
    min_indent = None
    for line in new_body_lines:
        if line.strip():
            indent_len = len(line) - len(line.lstrip())
            if min_indent is None or indent_len < min_indent:
                min_indent = indent_len
    if min_indent is None:
        min_indent = 0

    reindented = []
    for line in new_body_lines:
        if line.strip():
            reindented.append(body_indent + line[min_indent:])
        else:
            reindented.append("")
    new_body_text = "\\n".join(reindented) + "\\n"
else:
    new_body_text = body_indent + "pass\\n"

# Replace the body lines
if docstring_end is not None:
    # Keep everything up to and including the docstring, replace the rest
    new_lines = lines[:docstring_end] + [new_body_text] + lines[body_end_line:]
else:
    # Replace from first body statement to last
    new_lines = lines[:body_start_line] + [new_body_text] + lines[body_end_line:]

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
