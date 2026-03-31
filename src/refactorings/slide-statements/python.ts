import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import type { PreconditionResult, RefactoringResult } from "../../core/refactoring.types.js";
import { definePythonRefactoring, pythonParam } from "../../python/python-refactoring-builder.js";
import type { PythonProjectContext } from "../../python/python-refactoring-builder.js";

export const slidePythonStatements = definePythonRefactoring({
  name: "Slide Statements (Python)",
  kebabName: "slide-statements-python",
  tier: 1,
  description:
    "Moves a statement to a different position within the same block, allowing reordering without changing behavior.",
  params: [
    pythonParam.file(),
    pythonParam.number("target", "1-based line number of the statement to move"),
    pythonParam.number("destination", "1-based line number to move the statement to"),
  ],
  preconditions(ctx: PythonProjectContext, params: Record<string, unknown>): PreconditionResult {
    const errors: string[] = [];
    const file = params["file"] as string;
    const target = params["target"] as number;
    const destination = params["destination"] as number;

    const filePath = path.resolve(ctx.projectRoot, file);
    try {
      readFileSync(filePath, "utf-8");
    } catch {
      errors.push(`File not found: ${file}`);
      return { ok: false, errors };
    }

    if (target === destination) {
      errors.push("target and destination line numbers must differ");
    }

    if (target < 1 || destination < 1) {
      errors.push("Line numbers must be >= 1");
    }

    return { ok: errors.length === 0, errors };
  },
  apply(ctx: PythonProjectContext, params: Record<string, unknown>): RefactoringResult {
    const file = params["file"] as string;
    const target = params["target"] as number;
    const destination = params["destination"] as number;

    const filePath = path.resolve(ctx.projectRoot, file);

    let source: string;
    try {
      source = readFileSync(filePath, "utf-8");
    } catch {
      return { success: false, filesChanged: [], description: `File not found: ${file}` };
    }

    const result = slideStatements(source, target, destination);

    if (!result.success) {
      return { success: false, filesChanged: [], description: result.error };
    }

    writeFileSync(filePath, result.newSource, "utf-8");

    return {
      success: true,
      filesChanged: [file],
      description: `Moved statement from line ${target} to line ${destination}`,
    };
  },
});

interface SlideResult {
  success: boolean;
  newSource: string;
  error: string;
}

function slideStatements(source: string, target: number, destination: number): SlideResult {
  const script = `
import ast
import sys
import json

source = sys.stdin.read()
target_line = ${target}
dest_line = ${destination}

tree = ast.parse(source)
lines = source.splitlines(True)

# Walk AST to find all statement blocks (module body, function bodies, etc.)
# and locate the target and destination statements within the SAME block.

def find_statement_in_block(body, line):
    """Find a statement in a block that starts at the given line number."""
    for stmt in body:
        if stmt.lineno == line:
            return stmt
    return None

def get_all_blocks(node):
    """Yield (parent_node, body_list) for every statement block in the AST."""
    if isinstance(node, ast.Module):
        yield (node, node.body)
    if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
        yield (node, node.body)
    if isinstance(node, ast.ClassDef):
        yield (node, node.body)
    if isinstance(node, ast.If):
        yield (node, node.body)
        if node.orelse:
            yield (node, node.orelse)
    if isinstance(node, (ast.For, ast.AsyncFor)):
        yield (node, node.body)
        if node.orelse:
            yield (node, node.orelse)
    if isinstance(node, (ast.While,)):
        yield (node, node.body)
        if node.orelse:
            yield (node, node.orelse)
    if isinstance(node, (ast.With, ast.AsyncWith)):
        yield (node, node.body)
    if isinstance(node, ast.Try):
        yield (node, node.body)
        if node.orelse:
            yield (node, node.orelse)
        if node.finalbody:
            yield (node, node.finalbody)
        for handler in node.handlers:
            yield (handler, handler.body)
    if hasattr(ast, 'TryStar') and isinstance(node, ast.TryStar):
        yield (node, node.body)
        if node.orelse:
            yield (node, node.orelse)
        if node.finalbody:
            yield (node, node.finalbody)
        for handler in node.handlers:
            yield (handler, handler.body)
    # Recurse into children
    for child in ast.iter_child_nodes(node):
        yield from get_all_blocks(child)

# Find the block containing both target and destination
target_stmt = None
dest_stmt = None
containing_body = None

for parent, body in get_all_blocks(tree):
    t = find_statement_in_block(body, target_line)
    d = find_statement_in_block(body, dest_line)
    if t is not None and d is not None:
        target_stmt = t
        dest_stmt = d
        containing_body = body
        break

if target_stmt is None:
    print(json.dumps({"success": False, "error": f"No statement found at line {target_line}"}))
    sys.exit(0)

if dest_stmt is None:
    print(json.dumps({"success": False, "error": f"No statement found at line {dest_line}"}))
    sys.exit(0)

if containing_body is None:
    print(json.dumps({"success": False, "error": "Target and destination must be in the same block"}))
    sys.exit(0)

# Determine statement ranges (line numbers are 1-based, inclusive)
def stmt_range(stmt):
    """Return (start_line_0based, end_line_0based) for a statement including all its lines."""
    return (stmt.lineno - 1, stmt.end_lineno - 1)

target_start, target_end = stmt_range(target_stmt)
dest_start, dest_end = stmt_range(dest_stmt)

# Extract the target statement lines
target_lines = lines[target_start:target_end + 1]

# Remove target lines from the source
new_lines = lines[:target_start] + lines[target_end + 1:]

# Recalculate destination position after removal
if dest_start > target_start:
    # Destination was after target — adjust for removed lines
    removed_count = target_end - target_start + 1
    adjusted_dest_start = dest_start - removed_count
    adjusted_dest_end = dest_end - removed_count
else:
    adjusted_dest_start = dest_start
    adjusted_dest_end = dest_end

# Insert target lines at destination position
if target_start > dest_start:
    # Moving up — insert before the destination statement
    insert_pos = adjusted_dest_start
else:
    # Moving down — insert after the destination statement
    insert_pos = adjusted_dest_end + 1

new_lines = new_lines[:insert_pos] + target_lines + new_lines[insert_pos:]

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
