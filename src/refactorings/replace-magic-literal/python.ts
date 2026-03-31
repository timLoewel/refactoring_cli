import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import type { PreconditionResult, RefactoringResult } from "../../core/refactoring.types.js";
import { definePythonRefactoring, pythonParam } from "../../python/python-refactoring-builder.js";
import type { PythonProjectContext } from "../../python/python-refactoring-builder.js";

export const replacePythonMagicLiteral = definePythonRefactoring({
  name: "Replace Magic Literal (Python)",
  kebabName: "replace-magic-literal-python",
  tier: 1,
  description: "Replaces a magic number or string literal with a named constant.",
  params: [
    pythonParam.file(),
    pythonParam.string("target", "The literal value to replace (e.g. '3.14', '\"hello\"')"),
    pythonParam.identifier("name", "Name for the constant (e.g. 'PI', 'GREETING')"),
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

    if (!source.includes(target)) {
      errors.push(`Literal '${target}' not found in ${file}`);
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

    const result = replaceMagicLiteral(source, target, name);

    if (!result.success) {
      return { success: false, filesChanged: [], description: result.error };
    }

    writeFileSync(filePath, result.newSource, "utf-8");

    return {
      success: true,
      filesChanged: [file],
      description: `Replaced literal '${target}' with constant '${name}' (${result.replaceCount} occurrences)`,
    };
  },
});

interface ReplaceResult {
  success: boolean;
  newSource: string;
  replaceCount: number;
  error: string;
}

function replaceMagicLiteral(source: string, target: string, name: string): ReplaceResult {
  const script = `
import ast
import sys
import json

source = sys.stdin.read()
target = ${JSON.stringify(target)}
const_name = ${JSON.stringify(name)}

tree = ast.parse(source)
lines = source.splitlines(True)

# Collect string ranges to avoid replacing inside string literals that aren't the target
string_ranges = []
for node in ast.walk(tree):
    if isinstance(node, ast.Constant) and isinstance(node.value, str):
        offset = sum(len(lines[i]) for i in range(node.lineno - 1)) + node.col_offset
        end = sum(len(lines[i]) for i in range(node.end_lineno - 1)) + node.end_col_offset
        string_ranges.append((offset, end))

def in_string(pos):
    for s, e in string_ranges:
        if s <= pos < e:
            return True
    return False

# Find all occurrences not inside strings
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
    print(json.dumps({"success": False, "error": f"Literal '{target}' not found in code"}))
    sys.exit(0)

# Replace all occurrences in reverse order
new_source = source
for offset in reversed(occurrences):
    new_source = new_source[:offset] + const_name + new_source[offset + len(target):]

# Find the best insertion point for the constant (module level, before first function/class)
insert_line = 0
for node in ast.iter_child_nodes(tree):
    if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
        insert_line = node.lineno - 1
        if node.decorator_list:
            insert_line = node.decorator_list[0].lineno - 1
        break
    if isinstance(node, ast.Assign):
        # Skip past module-level variable assignments (like params)
        insert_line = node.end_lineno

mod_lines = new_source.splitlines(True)
assignment = f"{const_name} = {target}\\n"
# Add blank line after if needed
if insert_line < len(mod_lines) and mod_lines[insert_line].strip():
    assignment += "\\n"
mod_lines.insert(insert_line, assignment)
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
