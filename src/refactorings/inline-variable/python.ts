import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import type { PreconditionResult, RefactoringResult } from "../../core/refactoring.types.js";
import { definePythonRefactoring, pythonParam } from "../../python/python-refactoring-builder.js";
import type { PythonProjectContext } from "../../python/python-refactoring-builder.js";
import { parsePython } from "../../python/tree-sitter-parser.js";

export const inlinePythonVariable = definePythonRefactoring({
  name: "Inline Variable (Python)",
  kebabName: "inline-variable-python",
  tier: 1,
  description: "Replaces all references to a variable with its initializer expression, then removes the declaration.",
  params: [
    pythonParam.file(),
    pythonParam.identifier("target", "Name of the variable to inline"),
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
      errors.push(`Variable '${target}' not found in ${file}`);
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

    const result = inlineVariable(source, target);

    if (!result.success) {
      return { success: false, filesChanged: [], description: result.error };
    }

    writeFileSync(filePath, result.newSource, "utf-8");

    return {
      success: true,
      filesChanged: [file],
      description: `Inlined variable '${target}' (${result.replaceCount} references)`,
    };
  },
});

interface InlineResult {
  success: boolean;
  newSource: string;
  replaceCount: number;
  error: string;
}

function inlineVariable(source: string, target: string): InlineResult {
  const script = `
import ast
import sys
import json

source = sys.stdin.read()
target = ${JSON.stringify(target)}

tree = ast.parse(source)

# Find the assignment: target = <expr>
class AssignFinder(ast.NodeVisitor):
    def __init__(self):
        self.assign_node = None
        self.assign_value = None
        self.scope = []
        self.target_scope = None
        self.usages = []

    def visit_FunctionDef(self, node):
        self.scope.append(node.name)
        self.generic_visit(node)
        self.scope.pop()

    visit_AsyncFunctionDef = visit_FunctionDef

    def visit_Assign(self, node):
        if self.assign_node is None:
            for t in node.targets:
                if isinstance(t, ast.Name) and t.id == target:
                    self.assign_node = node
                    self.target_scope = tuple(self.scope)
                    break
        self.generic_visit(node)

    def visit_AnnAssign(self, node):
        if self.assign_node is None:
            if isinstance(node.target, ast.Name) and node.target.id == target and node.value:
                self.assign_node = node
                self.target_scope = tuple(self.scope)
        self.generic_visit(node)

    def visit_Name(self, node):
        if node.id == target and tuple(self.scope) == getattr(self, 'target_scope', None):
            self.usages.append(node)
        self.generic_visit(node)

finder = AssignFinder()
finder.visit(tree)

if finder.assign_node is None:
    print(json.dumps({"success": False, "error": f"No assignment found for '{target}'"}))
    sys.exit(0)

# Extract the value expression text from source
assign = finder.assign_node
lines = source.splitlines(True)
if isinstance(assign, ast.AnnAssign):
    val = assign.value
else:
    val = assign.value

val_start_offset = sum(len(lines[i]) for i in range(val.lineno - 1)) + val.col_offset
val_end_offset = sum(len(lines[i]) for i in range(val.end_lineno - 1)) + val.end_col_offset
value_text = source[val_start_offset:val_end_offset]

# Find all Name references (excluding the assignment target itself)
references = []
assign_line = assign.lineno
for usage in finder.usages:
    if usage.lineno == assign_line and usage.col_offset == (assign.targets[0].col_offset if isinstance(assign, ast.Assign) else assign.target.col_offset):
        continue  # Skip the assignment target itself
    references.append(usage)

if not references:
    print(json.dumps({"success": False, "error": f"Variable '{target}' has no references to inline"}))
    sys.exit(0)

# Replace references in reverse order
new_source = source
for ref in sorted(references, key=lambda n: (n.lineno, n.col_offset), reverse=True):
    ref_start = sum(len(lines[i]) for i in range(ref.lineno - 1)) + ref.col_offset
    ref_end = sum(len(lines[i]) for i in range(ref.end_lineno - 1)) + ref.end_col_offset
    new_source = new_source[:ref_start] + value_text + new_source[ref_end:]

# Remove the assignment line
new_lines = new_source.splitlines(True)
assign_line_idx = assign.lineno - 1
assign_end_idx = assign.end_lineno
new_lines = new_lines[:assign_line_idx] + new_lines[assign_end_idx:]
new_source = "".join(new_lines)

print(json.dumps({
    "success": True,
    "newSource": new_source,
    "replaceCount": len(references),
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
      replaceCount?: number;
      error?: string;
    };

    if (!parsed.success) {
      return { success: false, newSource: "", replaceCount: 0, error: parsed.error ?? "Unknown error" };
    }

    return {
      success: true,
      newSource: parsed.newSource ?? source,
      replaceCount: parsed.replaceCount ?? 0,
      error: "",
    };
  } catch (err) {
    return {
      success: false,
      newSource: "",
      replaceCount: 0,
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
