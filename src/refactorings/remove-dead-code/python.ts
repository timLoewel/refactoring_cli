import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import type { PreconditionResult, RefactoringResult } from "../../core/refactoring.types.js";
import { definePythonRefactoring, pythonParam } from "../../python/python-refactoring-builder.js";
import type { PythonProjectContext } from "../../python/python-refactoring-builder.js";
import { parsePython } from "../../python/tree-sitter-parser.js";

export const removePythonDeadCode = definePythonRefactoring({
  name: "Remove Dead Code (Python)",
  kebabName: "remove-dead-code-python",
  tier: 1,
  description: "Removes unreachable or unused code (functions, variables, imports).",
  params: [
    pythonParam.file(),
    pythonParam.identifier("target", "Name of the dead code element to remove"),
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

    const tree = parsePython(source);
    if (!hasIdentifier(tree.rootNode, target)) {
      errors.push(`'${target}' not found in ${file}`);
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

    const result = removeDeadCode(source, target);

    if (!result.success) {
      return { success: false, filesChanged: [], description: result.error };
    }

    writeFileSync(filePath, result.newSource, "utf-8");

    return {
      success: true,
      filesChanged: [file],
      description: `Removed dead code: '${target}'`,
    };
  },
});

interface RemoveResult {
  success: boolean;
  newSource: string;
  error: string;
}

function removeDeadCode(source: string, target: string): RemoveResult {
  const script = `
import ast
import sys
import json

source = sys.stdin.read()
target = ${JSON.stringify(target)}

tree = ast.parse(source)
lines = source.splitlines(True)

# Find the target definition (function, class, or variable)
target_node = None
for node in ast.iter_child_nodes(tree):
    if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
        if node.name == target:
            target_node = node
            break
    elif isinstance(node, ast.ClassDef):
        if node.name == target:
            target_node = node
            break
    elif isinstance(node, ast.Assign):
        for t in node.targets:
            if isinstance(t, ast.Name) and t.id == target:
                target_node = node
                break
        if target_node:
            break
    elif isinstance(node, ast.ImportFrom):
        for alias in node.names:
            if (alias.asname or alias.name) == target:
                target_node = node
                break
        if target_node:
            break

if target_node is None:
    print(json.dumps({"success": False, "error": f"'{target}' not found"}))
    sys.exit(0)

# Remove the lines containing the target
start_line = target_node.lineno - 1
if hasattr(target_node, 'decorator_list') and target_node.decorator_list:
    start_line = target_node.decorator_list[0].lineno - 1
end_line = target_node.end_lineno

new_lines = lines[:start_line] + lines[end_line:]

# Clean up extra blank lines
new_source = "".join(new_lines)
while "\\n\\n\\n" in new_source:
    new_source = new_source.replace("\\n\\n\\n", "\\n\\n")

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

    return {
      success: true,
      newSource: parsed.newSource ?? source,
      error: "",
    };
  } catch (err) {
    return {
      success: false,
      newSource: "",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function hasIdentifier(
  node: { type: string; text: string; childCount: number; child: (i: number) => typeof node | null },
  name: string,
): boolean {
  if (node.type === "identifier" && node.text === name) return true;
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child && hasIdentifier(child, name)) return true;
  }
  return false;
}
