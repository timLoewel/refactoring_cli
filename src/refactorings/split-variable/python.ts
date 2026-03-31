import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import type { PreconditionResult, RefactoringResult } from "../../core/refactoring.types.js";
import { definePythonRefactoring, pythonParam } from "../../python/python-refactoring-builder.js";
import type { PythonProjectContext } from "../../python/python-refactoring-builder.js";
import { parsePython } from "../../python/tree-sitter-parser.js";

export const splitPythonVariable = definePythonRefactoring({
  name: "Split Variable (Python)",
  kebabName: "split-variable-python",
  tier: 1,
  description:
    "Splits a variable that is assigned multiple times for different purposes into separate named variables.",
  params: [
    pythonParam.file(),
    pythonParam.identifier("target", "Name of the variable to split"),
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
      return { ok: false, errors };
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

    const result = splitVariable(source, target);

    if (!result.success) {
      return { success: false, filesChanged: [], description: result.error };
    }

    writeFileSync(filePath, result.newSource, "utf-8");

    return {
      success: true,
      filesChanged: [file],
      description: `Split variable '${target}' into separate variables for each assignment`,
    };
  },
});

interface SplitResult {
  success: boolean;
  newSource: string;
  error: string;
}

function splitVariable(source: string, target: string): SplitResult {
  const script = `
import ast
import sys
import json

source = sys.stdin.read()
target = ${JSON.stringify(target)}

tree = ast.parse(source)
lines = source.splitlines(True)

# Collect all assignment sites for the target variable.
# Each "segment" is: an assignment to the target + the reads of that value
# until the next assignment.

class AssignmentCollector(ast.NodeVisitor):
    """Collect assignment nodes to the target variable in order."""
    def __init__(self):
        self.assignments = []  # list of (line, col, node, kind)
        # kind: 'simple' for x = ..., 'augmented' for x += ..., 'walrus' for (x := ...)

    def visit_Assign(self, node):
        for t in node.targets:
            if isinstance(t, ast.Name) and t.id == target:
                self.assignments.append({
                    "line": node.lineno,
                    "end_line": node.end_lineno,
                    "col": node.col_offset,
                    "kind": "simple",
                    "node": node,
                })
        self.generic_visit(node)

    def visit_AnnAssign(self, node):
        if isinstance(node.target, ast.Name) and node.target.id == target and node.value is not None:
            self.assignments.append({
                "line": node.lineno,
                "end_line": node.end_lineno,
                "col": node.col_offset,
                "kind": "annotated",
                "node": node,
            })
        self.generic_visit(node)

    def visit_AugAssign(self, node):
        if isinstance(node.target, ast.Name) and node.target.id == target:
            self.assignments.append({
                "line": node.lineno,
                "end_line": node.end_lineno,
                "col": node.col_offset,
                "kind": "augmented",
                "node": node,
            })
        self.generic_visit(node)

    def visit_NamedExpr(self, node):
        if isinstance(node.target, ast.Name) and node.target.id == target:
            self.assignments.append({
                "line": node.lineno,
                "end_line": node.end_lineno,
                "col": node.col_offset,
                "kind": "walrus",
                "node": node,
            })
        self.generic_visit(node)

collector = AssignmentCollector()
collector.visit(tree)
assignments = collector.assignments

# Separate into segment-starting assignments (simple/annotated/walrus)
# and augmented assignments (belong to the preceding segment).
segment_starts = [a for a in assignments if a["kind"] != "augmented"]
aug_assigns = [a for a in assignments if a["kind"] == "augmented"]

if len(segment_starts) < 2:
    print(json.dumps({"success": False, "error": f"Variable '{target}' has fewer than 2 assignments; nothing to split"}))
    sys.exit(0)

# Collect all Name reads of the target variable (not assignment targets).
class ReadCollector(ast.NodeVisitor):
    def __init__(self):
        self.reads = []  # list of (line, col, end_col)

    def visit_Name(self, node):
        if node.id == target and isinstance(node.ctx, ast.Load):
            self.reads.append({
                "line": node.lineno,
                "col": node.col_offset,
                "end_col": node.end_col_offset,
            })
        self.generic_visit(node)

rc = ReadCollector()
rc.visit(tree)
reads = rc.reads

# Build segments: each segment-starting assignment "owns" the reads and
# augmented assignments that follow it until the next segment start.
segments = []
for i, a in enumerate(segment_starts):
    next_line = segment_starts[i + 1]["line"] if i + 1 < len(segment_starts) else float("inf")
    owned_reads = [r for r in reads if a["line"] <= r["line"] < next_line]
    owned_augs = [aug for aug in aug_assigns if a["line"] <= aug["line"] < next_line]
    segments.append({
        "assignment": a,
        "reads": owned_reads,
        "aug_assigns": owned_augs,
        "index": i + 1,  # 1-based naming
    })

# Build edits: for each segment, rename target -> target{index} in:
#   1. The assignment LHS
#   2. All owned reads
# For walrus assignments, rename the target inside the := expression.
edits = []  # list of (line_0based, col, end_col, new_text)

for seg in segments:
    a = seg["assignment"]
    idx = seg["index"]
    new_name = f"{target}{idx}"

    if a["kind"] == "simple":
        # Rename the LHS of the assignment
        node = a["node"]
        for t in node.targets:
            if isinstance(t, ast.Name) and t.id == target:
                edits.append((t.lineno - 1, t.col_offset, t.end_col_offset, new_name))
    elif a["kind"] == "annotated":
        # Rename the LHS of the annotated assignment
        node = a["node"]
        t = node.target
        edits.append((t.lineno - 1, t.col_offset, t.end_col_offset, new_name))
    elif a["kind"] == "walrus":
        node = a["node"]
        t = node.target
        edits.append((t.lineno - 1, t.col_offset, t.end_col_offset, new_name))

    # Rename augmented assignments in this segment
    for aug in seg["aug_assigns"]:
        aug_node = aug["node"]
        t = aug_node.target
        edits.append((t.lineno - 1, t.col_offset, t.end_col_offset, new_name))

    for r in seg["reads"]:
        edits.append((r["line"] - 1, r["col"], r["end_col"], new_name))

# Apply edits in reverse order (bottom-to-top, right-to-left) to preserve positions.
edits.sort(key=lambda e: (e[0], e[1]), reverse=True)

for line_idx, col, end_col, new_text in edits:
    line = lines[line_idx]
    lines[line_idx] = line[:col] + new_text + line[end_col:]

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
