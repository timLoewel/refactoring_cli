import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import type { PreconditionResult, RefactoringResult } from "../../core/refactoring.types.js";
import { definePythonRefactoring, pythonParam } from "../../python/python-refactoring-builder.js";
import type { PythonProjectContext } from "../../python/python-refactoring-builder.js";

export const consolidatePythonConditionalExpression = definePythonRefactoring({
  name: "Consolidate Conditional Expression (Python)",
  kebabName: "consolidate-conditional-expression-python",
  tier: 2,
  description:
    "Combines sequential if statements with the same body into a single if with a combined condition.",
  params: [
    pythonParam.file(),
    pythonParam.string("target", "Line number of the first if statement to consolidate (1-based)"),
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

    const targetStr = params["target"] as string;
    const lineNum = Number(targetStr);
    if (!Number.isInteger(lineNum) || lineNum < 1) {
      errors.push("param 'target' must be a positive integer line number");
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

    const result = consolidateConditional(source, Number(target));

    if (!result.success) {
      return { success: false, filesChanged: [], description: result.error };
    }

    writeFileSync(filePath, result.newSource, "utf-8");

    return {
      success: true,
      filesChanged: [file],
      description: `Consolidated consecutive if statements starting at line ${target}`,
    };
  },
});

interface ConsolidateResult {
  success: boolean;
  newSource: string;
  error: string;
}

function consolidateConditional(source: string, targetLine: number): ConsolidateResult {
  const script = `
import ast
import sys
import json

source = sys.stdin.read()
target_line = ${JSON.stringify(targetLine)}

tree = ast.parse(source)
lines = source.splitlines(True)

def get_source_text(node):
    """Extract the source text for an AST node."""
    start = sum(len(lines[i]) for i in range(node.lineno - 1)) + node.col_offset
    end = sum(len(lines[i]) for i in range(node.end_lineno - 1)) + node.end_col_offset
    return source[start:end]

def get_body_text(stmts, indent):
    """Get the normalized body text of a list of statements for comparison."""
    texts = []
    for s in stmts:
        t = get_source_text(s).strip()
        texts.append(t)
    return "\\n".join(texts)

def find_parent_body(tree, target_line):
    """Find the list of statements containing the if at target_line."""
    # Check module body
    for i, node in enumerate(tree.body):
        if isinstance(node, ast.If) and node.lineno == target_line:
            return tree.body, i
        # Check inside function/class bodies
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            result = find_in_body(node.body, target_line)
            if result:
                return result
    return None

def find_in_body(body, target_line):
    """Recursively search a body list for the target if-statement."""
    for i, node in enumerate(body):
        if isinstance(node, ast.If) and node.lineno == target_line:
            return body, i
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            result = find_in_body(node.body, target_line)
            if result:
                return result
        if isinstance(node, (ast.If, ast.For, ast.While, ast.With, ast.Try)):
            for attr in ('body', 'orelse', 'handlers', 'finalbody'):
                sub = getattr(node, attr, None)
                if isinstance(sub, list):
                    result = find_in_body(sub, target_line)
                    if result:
                        return result
    return None

result = find_parent_body(tree, target_line)

if result is None:
    print(json.dumps({"success": False, "error": f"No if statement found at line {target_line}"}))
    sys.exit(0)

body, start_idx = result

# Collect consecutive if statements with the same body
first_if = body[start_idx]
if not isinstance(first_if, ast.If):
    print(json.dumps({"success": False, "error": f"No if statement found at line {target_line}"}))
    sys.exit(0)

# Get the indentation of the first if
first_line = lines[first_if.lineno - 1]
indent = ""
for ch in first_line:
    if ch in (" ", "\\t"):
        indent += ch
    else:
        break

# Get the body text of the first if for comparison
first_body_text = get_body_text(first_if.body, indent)

# Also check if the first if has an else clause — if so, we can't consolidate
if first_if.orelse:
    print(json.dumps({"success": False, "error": "First if statement has an else clause; cannot consolidate"}))
    sys.exit(0)

conditions = [get_source_text(first_if.test)]
count = 1
idx = start_idx + 1

while idx < len(body):
    node = body[idx]
    if not isinstance(node, ast.If):
        break
    # Check body matches
    node_body_text = get_body_text(node.body, indent)
    if node_body_text != first_body_text:
        break
    # Check no else clause
    if node.orelse:
        break
    conditions.append(get_source_text(node.test))
    count += 1
    idx += 1

if count < 2:
    print(json.dumps({"success": False, "error": "Need at least 2 consecutive if statements with the same body"}))
    sys.exit(0)

# Build the consolidated condition
# Wrap each condition in parens if it contains 'and' or 'or' (to preserve precedence)
wrapped = []
for c in conditions:
    stripped = c.strip()
    if ' and ' in stripped or ' or ' in stripped:
        wrapped.append(f"({stripped})")
    else:
        wrapped.append(stripped)

combined_condition = " or ".join(wrapped)

# Build the new if statement
body_lines = []
for stmt in first_if.body:
    start_line = stmt.lineno - 1
    end_line = stmt.end_lineno
    for li in range(start_line, end_line):
        body_lines.append(lines[li])

new_if = f"{indent}if {combined_condition}:\\n"
new_block = new_if + "".join(body_lines)

# Calculate the range of lines to replace (from first if to end of last if)
first_line_idx = first_if.lineno - 1
last_if = body[start_idx + count - 1]
last_line_idx = last_if.end_lineno  # exclusive

new_lines = list(lines)
new_lines[first_line_idx:last_line_idx] = [new_block]

new_source = "".join(new_lines)

print(json.dumps({
    "success": True,
    "newSource": new_source,
    "count": count,
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
      count?: number;
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
