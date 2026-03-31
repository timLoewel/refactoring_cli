import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import type { PreconditionResult, RefactoringResult } from "../../core/refactoring.types.js";
import { definePythonRefactoring, pythonParam } from "../../python/python-refactoring-builder.js";
import type { PythonProjectContext } from "../../python/python-refactoring-builder.js";

export const replaceNestedConditionalWithGuardClausesPython = definePythonRefactoring({
  name: "Replace Nested Conditional With Guard Clauses (Python)",
  kebabName: "replace-nested-conditional-with-guard-clauses-python",
  tier: 2,
  description:
    "Flattens deeply nested if-else conditionals in a function into early-return guard clauses.",
  params: [
    pythonParam.file(),
    pythonParam.identifier("target", "Name of the function to flatten nested conditionals in"),
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

    const result = replaceNestedConditional(source, target);

    if (!result.success) {
      return { success: false, filesChanged: [], description: result.error };
    }

    writeFileSync(filePath, result.newSource, "utf-8");

    return {
      success: true,
      filesChanged: [file],
      description: `Replaced nested conditionals in '${target}' with guard clauses`,
    };
  },
});

interface TransformResult {
  success: boolean;
  newSource: string;
  error: string;
}

function replaceNestedConditional(source: string, target: string): TransformResult {
  const script = `
import ast
import sys
import json

source = sys.stdin.read()
target = ${JSON.stringify(target)}

tree = ast.parse(source)
lines = source.splitlines(True)

def get_source_segment(node):
    """Extract the source text for an AST node using line/col offsets."""
    start = sum(len(lines[i]) for i in range(node.lineno - 1)) + node.col_offset
    end = sum(len(lines[i]) for i in range(node.end_lineno - 1)) + node.end_col_offset
    return source[start:end]

def find_target_function(tree, name):
    """Find a function def by name at any level."""
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name == name:
            return node
    return None

def get_indent(node):
    """Get the indentation string of a node."""
    line = lines[node.lineno - 1]
    indent = ""
    for ch in line:
        if ch in (" ", "\\t"):
            indent += ch
        else:
            break
    return indent

def get_stmt_text(stmt, new_indent):
    """Get the text of a statement, re-indented to new_indent."""
    start_line = stmt.lineno - 1
    end_line = stmt.end_lineno
    result = []
    # Determine the original indent of the first line
    orig_indent = ""
    first = lines[start_line]
    for ch in first:
        if ch in (" ", "\\t"):
            orig_indent += ch
        else:
            break
    for li in range(start_line, end_line):
        line_text = lines[li]
        # Strip the original indentation prefix and apply new indent
        if line_text.startswith(orig_indent):
            stripped = line_text[len(orig_indent):]
            result.append(new_indent + stripped)
        else:
            stripped = line_text.lstrip()
            result.append(new_indent + stripped)
    return result

def stmt_contains_return(stmts):
    """Check if any statement in the list is a Return."""
    return any(isinstance(s, ast.Return) for s in stmts)

def has_if_else(stmts):
    """Check if there's at least one if/else that can be converted to guard clauses."""
    for stmt in stmts:
        if isinstance(stmt, ast.If) and stmt.orelse:
            return True
    return False

def flatten_guard_clauses(stmts, indent):
    """Recursively flatten if/else chains into guard clauses."""
    result = []

    for stmt in stmts:
        if not isinstance(stmt, ast.If) or not stmt.orelse:
            result.extend(get_stmt_text(stmt, indent))
            continue

        then_body = stmt.body
        else_body = stmt.orelse
        condition = get_source_segment(stmt.test)

        then_has_return = stmt_contains_return(then_body)
        else_has_return = stmt_contains_return(else_body)

        if then_has_return:
            guard_cond = condition
            guard_stmts = then_body
            remaining_stmts = else_body
        elif else_has_return:
            guard_cond = f"not ({condition})"
            guard_stmts = else_body
            remaining_stmts = then_body
        else:
            result.extend(get_stmt_text(stmt, indent))
            continue

        # Emit guard clause
        result.append(f"{indent}if {guard_cond}:\\n")
        body_indent = indent + "    "
        for s in guard_stmts:
            result.extend(get_stmt_text(s, body_indent))

        # Recursively flatten remaining statements
        remaining_lines = flatten_guard_clauses(remaining_stmts, indent)
        result.extend(remaining_lines)

    return result

func = find_target_function(tree, target)
if func is None:
    print(json.dumps({"success": False, "error": f"Function '{target}' not found"}))
    sys.exit(0)

if not has_if_else(func.body):
    print(json.dumps({"success": False, "error": f"Function '{target}' has no if/else to convert to guard clauses"}))
    sys.exit(0)

body_indent = get_indent(func.body[0])
new_body_lines = flatten_guard_clauses(func.body, body_indent)

first_body_line = func.body[0].lineno - 1
last_body_line = func.body[-1].end_lineno

new_lines = list(lines)
new_lines[first_body_line:last_body_line] = new_body_lines

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
