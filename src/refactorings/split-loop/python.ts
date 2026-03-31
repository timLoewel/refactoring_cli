import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import type { PreconditionResult, RefactoringResult } from "../../core/refactoring.types.js";
import { definePythonRefactoring, pythonParam } from "../../python/python-refactoring-builder.js";
import type { PythonProjectContext } from "../../python/python-refactoring-builder.js";

export const splitPythonLoop = definePythonRefactoring({
  name: "Split Loop (Python)",
  kebabName: "split-loop-python",
  tier: 2,
  description: "Splits a loop that does two things into two separate loops, each doing one thing.",
  params: [
    pythonParam.file(),
    pythonParam.string("target", "1-based line number of the for/while loop to split"),
  ],
  preconditions(ctx: PythonProjectContext, params: Record<string, unknown>): PreconditionResult {
    const errors: string[] = [];
    const file = params["file"] as string;
    const targetStr = params["target"] as string;
    const lineNum = Number(targetStr);

    if (!Number.isInteger(lineNum) || lineNum < 1) {
      errors.push("param 'target' must be a positive integer line number");
      return { ok: false, errors };
    }

    const filePath = path.resolve(ctx.projectRoot, file);
    let source: string;
    try {
      source = readFileSync(filePath, "utf-8");
    } catch {
      errors.push(`File not found: ${file}`);
      return { ok: false, errors };
    }

    const lines = source.split("\n");
    const targetLine = lines[lineNum - 1];
    if (!targetLine || !/^\s*(for |while )/.test(targetLine)) {
      errors.push(`No for/while loop found at line ${lineNum}`);
      return { ok: false, errors };
    }

    return { ok: errors.length === 0, errors };
  },
  apply(ctx: PythonProjectContext, params: Record<string, unknown>): RefactoringResult {
    const file = params["file"] as string;
    const lineNum = Number(params["target"] as string);

    const filePath = path.resolve(ctx.projectRoot, file);

    let source: string;
    try {
      source = readFileSync(filePath, "utf-8");
    } catch {
      return { success: false, filesChanged: [], description: `File not found: ${file}` };
    }

    const result = splitLoop(source, lineNum);

    if (!result.success) {
      return { success: false, filesChanged: [], description: result.error };
    }

    writeFileSync(filePath, result.newSource, "utf-8");

    return {
      success: true,
      filesChanged: [file],
      description: `Split loop at line ${lineNum} into two separate loops`,
    };
  },
});

interface SplitResult {
  success: boolean;
  newSource: string;
  error: string;
}

function splitLoop(source: string, targetLine: number): SplitResult {
  const script = `
import ast
import sys
import json

source = sys.stdin.read()
target_line = ${targetLine}

tree = ast.parse(source)
lines = source.splitlines(True)

# Find the loop at the target line
loop_node = None
for node in ast.walk(tree):
    if isinstance(node, (ast.For, ast.AsyncFor, ast.While)) and node.lineno == target_line:
        loop_node = node
        break

if loop_node is None:
    print(json.dumps({"success": False, "error": f"No loop found at line {target_line}"}))
    sys.exit(0)

body = loop_node.body
if len(body) < 2:
    print(json.dumps({"success": False, "error": f"Loop at line {target_line} must have at least 2 statements to split"}))
    sys.exit(0)

# Split the body into two halves
mid = (len(body) + 1) // 2
first_half = body[:mid]
second_half = body[mid:]

# Get the indentation of the loop itself
loop_line = lines[loop_node.lineno - 1]
loop_indent = ""
for ch in loop_line:
    if ch in (" ", "\\t"):
        loop_indent += ch
    else:
        break

# Get the body indentation from the first body statement
body_indent = ""
body_line = lines[body[0].lineno - 1]
for ch in body_line:
    if ch in (" ", "\\t"):
        body_indent += ch
    else:
        break

# Build the loop header (the "for x in items:" or "while cond:" line, possibly multi-line)
# The header spans from loop_node.lineno to body[0].lineno - 1
header_start = loop_node.lineno - 1  # 0-based
header_end = body[0].lineno - 1  # 0-based, exclusive (first body line)
header_lines = lines[header_start:header_end]
header_text = "".join(header_lines)

# Extract statement text for each half
def extract_stmts(stmts):
    if not stmts:
        return body_indent + "pass\\n"
    first = stmts[0]
    last = stmts[-1]
    start = first.lineno - 1  # 0-based
    end = last.end_lineno  # 0-based exclusive (end_lineno is 1-based inclusive)
    return "".join(lines[start:end])

first_body_text = extract_stmts(first_half)
second_body_text = extract_stmts(second_half)

# Build the two new loops
first_loop = header_text + first_body_text
second_loop = header_text + second_body_text

# Determine the full range of the original loop (header + body + else clause)
loop_start = loop_node.lineno - 1  # 0-based
loop_end = loop_node.end_lineno  # 0-based exclusive

# Replace the original loop with the two new loops
new_lines = lines[:loop_start]
new_lines.append(first_loop)
new_lines.append(second_loop)
new_lines.extend(lines[loop_end:])

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
