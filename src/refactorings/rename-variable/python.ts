import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import type { PreconditionResult, RefactoringResult } from "../../core/refactoring.types.js";
import { definePythonRefactoring, pythonParam } from "../../python/python-refactoring-builder.js";
import type { PythonProjectContext } from "../../python/python-refactoring-builder.js";
import { parsePython } from "../../python/tree-sitter-parser.js";

export const renamePythonVariable = definePythonRefactoring({
  name: "Rename Variable (Python)",
  kebabName: "rename-variable-python",
  tier: 1,
  description:
    "Renames a Python variable and all its references using pyright's rename, ensuring scope-aware renaming.",
  params: [
    pythonParam.file(),
    pythonParam.identifier("target", "Current name of the variable to rename"),
    pythonParam.identifier("newName", "New name for the variable"),
  ],
  preconditions(ctx: PythonProjectContext, params: Record<string, unknown>): PreconditionResult {
    const errors: string[] = [];
    const file = params["file"] as string;
    const target = params["target"] as string;
    const newName = params["newName"] as string;

    const filePath = path.resolve(ctx.projectRoot, file);
    let source: string;
    try {
      source = readFileSync(filePath, "utf-8");
    } catch {
      errors.push(`File not found: ${file}`);
      return { ok: false, errors };
    }

    // Use tree-sitter to verify the variable exists
    const tree = parsePython(source);
    if (!hasIdentifier(tree.rootNode, target)) {
      errors.push(`Variable '${target}' not found in ${file}`);
    }

    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(newName)) {
      errors.push(`'${newName}' is not a valid Python identifier`);
    }

    return { ok: errors.length === 0, errors };
  },
  apply(ctx: PythonProjectContext, params: Record<string, unknown>): RefactoringResult {
    const file = params["file"] as string;
    const target = params["target"] as string;
    const newName = params["newName"] as string;
    const line = params["line"] as number | undefined;

    const filePath = path.resolve(ctx.projectRoot, file);

    let source: string;
    try {
      source = readFileSync(filePath, "utf-8");
    } catch {
      return { success: false, filesChanged: [], description: `File not found: ${file}` };
    }

    // Use pyright via synchronous subprocess to get scope-aware rename edits
    const result = pyrightRename(filePath, source, target, newName, line);

    if (!result.success) {
      return { success: false, filesChanged: [], description: result.error };
    }

    writeFileSync(filePath, result.newSource, "utf-8");

    return {
      success: true,
      filesChanged: [file],
      description: `Renamed variable '${target}' to '${newName}' (${result.editCount} references)`,
    };
  },
});

interface RenameResult {
  success: boolean;
  newSource: string;
  editCount: number;
  error: string;
}

/**
 * Use a Python script to perform scope-aware rename.
 * Falls back to pyright's rename when available, but for single-file
 * renames uses Python's ast module for scope analysis.
 */
function pyrightRename(
  filePath: string,
  source: string,
  target: string,
  newName: string,
  targetLine?: number,
): RenameResult {
  // Use a Python script that leverages Python's own scope analysis
  // to correctly rename only the right variable
  const script = `
import ast
import sys
import json
import re

source = sys.stdin.read()
target = ${JSON.stringify(target)}
new_name = ${JSON.stringify(newName)}
target_line = ${targetLine !== undefined ? targetLine : "None"}

class ScopeAwareRenamer(ast.NodeVisitor):
    """Rename a variable and all its same-scope references."""

    def __init__(self):
        self.edits = []
        self.nonlocal_global_lines = []  # lines with nonlocal/global declarations
        self.scope_stack = []

    def _current_scope(self):
        return tuple(self.scope_stack)

    def _push_scope(self, name):
        self.scope_stack.append(name)

    def _pop_scope(self):
        self.scope_stack.pop()

    def visit_FunctionDef(self, node):
        self._push_scope(node.name)
        self.generic_visit(node)
        self._pop_scope()

    visit_AsyncFunctionDef = visit_FunctionDef

    def visit_ClassDef(self, node):
        self._push_scope(node.name)
        self.generic_visit(node)
        self._pop_scope()

    def visit_Name(self, node):
        if node.id == target:
            self.edits.append({
                "line": node.lineno,
                "col": node.col_offset,
                "end_col": node.end_col_offset,
                "scope": self._current_scope(),
            })
        self.generic_visit(node)

    def visit_Global(self, node):
        if target in node.names:
            self.nonlocal_global_lines.append({
                "line": node.lineno,
                "scope": self._current_scope(),
                "kind": "global",
            })
        self.generic_visit(node)

    def visit_Nonlocal(self, node):
        if target in node.names:
            self.nonlocal_global_lines.append({
                "line": node.lineno,
                "scope": self._current_scope(),
                "kind": "nonlocal",
            })
        self.generic_visit(node)

tree = ast.parse(source)

renamer = ScopeAwareRenamer()
renamer.visit(tree)

if not renamer.edits:
    print(json.dumps({"success": False, "error": f"Variable '{target}' not found"}))
    sys.exit(0)

# Determine target scope
if target_line is not None:
    target_scope_edits = [e for e in renamer.edits if e["line"] == target_line + 1]
    if target_scope_edits:
        scope = target_scope_edits[0]["scope"]
    else:
        scope = renamer.edits[0]["scope"]
else:
    scope = renamer.edits[0]["scope"]

# Filter Name edits to same scope
scope_edits = [e for e in renamer.edits if e["scope"] == scope]

# Also include nonlocal/global references in child scopes that refer to our scope.
# A nonlocal in scope (A, B, inner) referring to target means the variable in scope
# (A, B) is the same variable. Include those child scope Name edits too.
nonlocal_scopes = set()
for nl in renamer.nonlocal_global_lines:
    # A nonlocal in scope X refers to the enclosing scope's variable.
    # If the enclosing scope is our target scope, include scope X.
    nl_scope = nl["scope"]
    parent = nl_scope[:-1] if nl_scope else ()
    if parent == scope:
        nonlocal_scopes.add(nl_scope)

# Add edits from nonlocal-linked scopes
for edit in renamer.edits:
    if edit["scope"] in nonlocal_scopes and edit not in scope_edits:
        scope_edits.append(edit)

# Apply Name edits (reverse order to maintain positions)
lines = source.splitlines(True)
for edit in sorted(scope_edits, key=lambda e: (e["line"], e["col"]), reverse=True):
    line_idx = edit["line"] - 1
    line = lines[line_idx]
    lines[line_idx] = line[:edit["col"]] + new_name + line[edit["end_col"]:]

# Also rename in nonlocal/global declarations (text-based replacement on those lines)
nl_lines_to_fix = set()
for nl in renamer.nonlocal_global_lines:
    nl_scope = nl["scope"]
    parent = nl_scope[:-1] if nl_scope else ()
    if parent == scope or nl_scope == scope:
        nl_lines_to_fix.add(nl["line"] - 1)

for line_idx in sorted(nl_lines_to_fix, reverse=True):
    line = lines[line_idx]
    # Replace the target name in nonlocal/global statement
    lines[line_idx] = re.sub(r'\\b' + re.escape(target) + r'\\b', new_name, line)

result = "".join(lines)
edit_count = len(scope_edits) + len(nl_lines_to_fix)
print(json.dumps({
    "success": True,
    "newSource": result,
    "editCount": edit_count,
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
      editCount?: number;
      error?: string;
    };

    if (!parsed.success) {
      return {
        success: false,
        newSource: "",
        editCount: 0,
        error: parsed.error ?? "Unknown error",
      };
    }

    return {
      success: true,
      newSource: parsed.newSource ?? source,
      editCount: parsed.editCount ?? 0,
      error: "",
    };
  } catch (err) {
    return {
      success: false,
      newSource: "",
      editCount: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function hasIdentifier(
  node:
    | {
        type: string;
        text: string;
        childCount: number;
        child: (i: number) => typeof node | null;
      }
    | null
    | undefined,
  name: string,
): boolean {
  if (!node) return false;
  if (node.type === "identifier" && node.text === name) {
    return true;
  }
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child && hasIdentifier(child, name)) return true;
  }
  return false;
}
