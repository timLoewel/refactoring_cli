import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import type { PreconditionResult, RefactoringResult } from "../../core/refactoring.types.js";
import { definePythonRefactoring, pythonParam } from "../../python/python-refactoring-builder.js";
import type { PythonProjectContext } from "../../python/python-refactoring-builder.js";
import { mergeImports } from "../../python/codegen/import-merger.js";

export const replaceInlineCodeWithFunctionCallPython = definePythonRefactoring({
  name: "Replace Inline Code With Function Call (Python)",
  kebabName: "replace-inline-code-with-function-call-python",
  tier: 2,
  description:
    "Replaces occurrences of an inline expression with a call to a named function.",
  params: [
    pythonParam.file(),
    pythonParam.string("target", "Inline code expression to replace"),
    pythonParam.identifier("name", "Name of the function to call instead"),
    pythonParam.string("importFrom", "Module to import the function from (optional)", false),
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
      errors.push(`Inline code '${target}' not found in file`);
    }

    return { ok: errors.length === 0, errors };
  },
  apply(ctx: PythonProjectContext, params: Record<string, unknown>): RefactoringResult {
    const file = params["file"] as string;
    const target = params["target"] as string;
    const name = params["name"] as string;
    const importFrom = params["importFrom"] as string | undefined;

    const filePath = path.resolve(ctx.projectRoot, file);

    let source: string;
    try {
      source = readFileSync(filePath, "utf-8");
    } catch {
      return { success: false, filesChanged: [], description: `File not found: ${file}` };
    }

    const result = applyReplaceInlineCode(source, target, name);

    if (!result.success) {
      return { success: false, filesChanged: [], description: result.error };
    }

    let newSource = result.newSource;

    if (importFrom) {
      newSource = mergeImports(newSource, [{ module: importFrom, name, isRelative: false, isTypeOnly: false }]);
    }

    writeFileSync(filePath, newSource, "utf-8");

    return {
      success: true,
      filesChanged: [file],
      description: `Replaced ${result.replaceCount} occurrence(s) of inline code with call to '${name}()'`,
    };
  },
});

interface ReplaceResult {
  success: boolean;
  newSource: string;
  replaceCount: number;
  error: string;
}

function applyReplaceInlineCode(
  source: string,
  target: string,
  name: string,
): ReplaceResult {
  const script = `
import ast
import sys
import json
import re

source = sys.stdin.read()
target = ${JSON.stringify(target)}
func_name = ${JSON.stringify(name)}

tree = ast.parse(source)
lines = source.splitlines(True)

# Collect string literal ranges to avoid replacing inside string contents
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

# Find all occurrences of target not inside string literals
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
    print(json.dumps({"success": False, "newSource": "", "replaceCount": 0, "error": f"Inline code '{target}' not found in code"}))
    sys.exit(0)

# Replace all occurrences in reverse order
replacement = f"{func_name}()"
new_source = source
for offset in reversed(occurrences):
    new_source = new_source[:offset] + replacement + new_source[offset + len(target):]

print(json.dumps({
    "success": True,
    "newSource": new_source,
    "replaceCount": len(occurrences),
    "error": ""
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
