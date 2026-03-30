import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import type { PreconditionResult, RefactoringResult } from "../../core/refactoring.types.js";
import { definePythonRefactoring, pythonParam } from "../../python/python-refactoring-builder.js";
import type { PythonProjectContext } from "../../python/python-refactoring-builder.js";

export const decomposePythonConditional = definePythonRefactoring({
  name: "Decompose Conditional (Python)",
  kebabName: "decompose-conditional-python",
  tier: 1,
  description:
    "Extracts a complex conditional expression into a named boolean variable or function.",
  params: [
    pythonParam.file(),
    pythonParam.identifier("target", "Name of the function containing the conditional"),
    pythonParam.identifier("condition_name", "Name for the extracted condition variable"),
  ],
  preconditions(ctx: PythonProjectContext, params: Record<string, unknown>): PreconditionResult {
    const errors: string[] = [];
    const file = params["file"] as string;

    const filePath = path.resolve(ctx.projectRoot, file);
    try {
      readFileSync(filePath, "utf-8");
    } catch {
      errors.push(`File not found: ${file}`);
    }

    return { ok: errors.length === 0, errors };
  },
  apply(ctx: PythonProjectContext, params: Record<string, unknown>): RefactoringResult {
    const file = params["file"] as string;
    const target = params["target"] as string;
    const conditionName = params["condition_name"] as string;

    const filePath = path.resolve(ctx.projectRoot, file);

    let source: string;
    try {
      source = readFileSync(filePath, "utf-8");
    } catch {
      return { success: false, filesChanged: [], description: `File not found: ${file}` };
    }

    const result = decomposeConditional(source, target, conditionName);

    if (!result.success) {
      return { success: false, filesChanged: [], description: result.error };
    }

    writeFileSync(filePath, result.newSource, "utf-8");

    return {
      success: true,
      filesChanged: [file],
      description: `Decomposed conditional in '${target}' into variable '${conditionName}'`,
    };
  },
});

interface DecomposeResult {
  success: boolean;
  newSource: string;
  error: string;
}

function decomposeConditional(
  source: string,
  target: string,
  conditionName: string,
): DecomposeResult {
  const script = `
import ast
import sys
import json

source = sys.stdin.read()
target = ${JSON.stringify(target)}
cond_name = ${JSON.stringify(conditionName)}

tree = ast.parse(source)
lines = source.splitlines(True)

# Find the target function
func_node = None
for node in ast.walk(tree):
    if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
        if node.name == target:
            func_node = node
            break

if func_node is None:
    # If no function specified, find the first if-statement at module level or in main
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            if node.name == "main":
                func_node = node
                break

if func_node is None:
    print(json.dumps({"success": False, "error": f"Function '{target}' not found"}))
    sys.exit(0)

# Find the first if-statement in the function
if_node = None
for node in ast.walk(func_node):
    if isinstance(node, ast.If):
        if_node = node
        break

if if_node is None:
    print(json.dumps({"success": False, "error": "No if-statement found in function"}))
    sys.exit(0)

# Extract the condition text
cond = if_node.test
cond_start = sum(len(lines[i]) for i in range(cond.lineno - 1)) + cond.col_offset
cond_end = sum(len(lines[i]) for i in range(cond.end_lineno - 1)) + cond.end_col_offset
cond_text = source[cond_start:cond_end]

# Get the indentation of the if-statement
if_line = lines[if_node.lineno - 1]
indent = ""
for ch in if_line:
    if ch in (" ", "\\t"):
        indent += ch
    else:
        break

# Insert variable assignment before the if-statement and replace condition
assignment = f"{indent}{cond_name} = {cond_text}\\n"
new_if_line = if_line[:if_line.index("if ") + 3] + cond_name + ":\\n"

new_lines = list(lines)
new_lines[if_node.lineno - 1] = new_if_line
new_lines.insert(if_node.lineno - 1, assignment)

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
