import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import type { PreconditionResult, RefactoringResult } from "../../core/refactoring.types.js";
import { definePythonRefactoring, pythonParam } from "../../python/python-refactoring-builder.js";
import type { PythonProjectContext } from "../../python/python-refactoring-builder.js";
import { parsePython } from "../../python/tree-sitter-parser.js";

export const extractPythonVariable = definePythonRefactoring({
  name: "Extract Variable (Python)",
  kebabName: "extract-variable-python",
  tier: 1,
  description:
    "Extracts a repeated expression into a named variable and replaces all occurrences in the same scope.",
  params: [
    pythonParam.file(),
    pythonParam.string("target", "The expression text to extract into a variable"),
    pythonParam.identifier("name", "The name for the new variable"),
  ],
  preconditions(ctx: PythonProjectContext, params: Record<string, unknown>): PreconditionResult {
    const errors: string[] = [];
    const file = params["file"] as string;
    const target = params["target"] as string;
    const name = params["name"] as string;

    const filePath = path.resolve(ctx.projectRoot, file);
    let source: string;
    try {
      source = readFileSync(filePath, "utf-8");
    } catch {
      errors.push(`File not found: ${file}`);
      return { ok: false, errors };
    }

    // Use tree-sitter to verify the file parses
    const tree = parsePython(source);
    if (tree.rootNode.hasError) {
      errors.push(`File has syntax errors: ${file}`);
    }

    if (!source.includes(target)) {
      errors.push(`Expression '${target}' not found in ${file}`);
    }

    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
      errors.push(`'${name}' is not a valid Python identifier`);
    }

    return { ok: errors.length === 0, errors };
  },
  apply(ctx: PythonProjectContext, params: Record<string, unknown>): RefactoringResult {
    const file = params["file"] as string;
    const target = params["target"] as string;
    const name = params["name"] as string;

    const filePath = path.resolve(ctx.projectRoot, file);

    let source: string;
    try {
      source = readFileSync(filePath, "utf-8");
    } catch {
      return { success: false, filesChanged: [], description: `File not found: ${file}` };
    }

    const result = extractVariable(filePath, source, target, name);

    if (!result.success) {
      return { success: false, filesChanged: [], description: result.error };
    }

    writeFileSync(filePath, result.newSource, "utf-8");

    return {
      success: true,
      filesChanged: [file],
      description: `Extracted '${target}' into variable '${name}' (${result.replaceCount} occurrences)`,
    };
  },
});

interface ExtractResult {
  success: boolean;
  newSource: string;
  replaceCount: number;
  error: string;
}

/**
 * Use a Python script to find all occurrences of the target expression,
 * insert a variable assignment before the first usage, and replace all
 * occurrences with the new variable name.
 */
function extractVariable(
  filePath: string,
  source: string,
  target: string,
  name: string,
): ExtractResult {
  const script = `
import ast
import sys
import json

source = sys.stdin.read()
target = ${JSON.stringify(target)}
var_name = ${JSON.stringify(name)}

# Parse to verify syntax and find indentation
try:
    tree = ast.parse(source)
except SyntaxError as e:
    print(json.dumps({"success": False, "error": f"Syntax error: {e}"}))
    sys.exit(0)

lines = source.splitlines(True)

# Collect byte ranges of all string literals to exclude them from replacement
string_ranges = []
for node in ast.walk(tree):
    if isinstance(node, ast.Constant) and isinstance(node.value, str):
        # Calculate byte offset from line/col
        offset = 0
        for i in range(node.lineno - 1):
            offset += len(lines[i])
        start = offset + node.col_offset
        end_offset = 0
        for i in range(node.end_lineno - 1):
            end_offset += len(lines[i])
        end = end_offset + node.end_col_offset
        string_ranges.append((start, end))

def in_string(pos):
    for s, e in string_ranges:
        if s <= pos < e:
            return True
    return False

# Find all occurrences of the target expression NOT inside strings
occurrences = []
search_start = 0
while True:
    idx = source.find(target, search_start)
    if idx == -1:
        break
    if not in_string(idx):
        occurrences.append(idx)
    search_start = idx + 1

if not occurrences:
    print(json.dumps({"success": False, "error": f"Expression '{target}' not found"}))
    sys.exit(0)

# Find which line the first occurrence is on (0-based)
first_offset = occurrences[0]
char_count = 0
first_line_idx = 0
for i, line in enumerate(lines):
    if char_count + len(line) > first_offset:
        first_line_idx = i
        break
    char_count += len(line)

# Determine indentation of the first line containing the expression
first_line = lines[first_line_idx]
indent = ""
for ch in first_line:
    if ch in (" ", "\\t"):
        indent += ch
    else:
        break

# Build the assignment line
assignment = f"{indent}{var_name} = {target}\\n"

# Replace all occurrences in reverse order to preserve positions
new_source = source
for offset in reversed(occurrences):
    new_source = new_source[:offset] + var_name + new_source[offset + len(target):]

# Insert the assignment before the first occurrence line
# Recalculate line positions from the modified source
mod_lines = new_source.splitlines(True)
mod_lines.insert(first_line_idx, assignment)
new_source = "".join(mod_lines)

print(json.dumps({
    "success": True,
    "newSource": new_source,
    "replaceCount": len(occurrences),
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
      return {
        success: false,
        newSource: "",
        replaceCount: 0,
        error: parsed.error ?? "Unknown error",
      };
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
