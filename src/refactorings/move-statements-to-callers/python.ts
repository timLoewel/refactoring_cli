import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import type { PreconditionResult, RefactoringResult } from "../../core/refactoring.types.js";
import { definePythonRefactoring, pythonParam } from "../../python/python-refactoring-builder.js";
import type { PythonProjectContext } from "../../python/python-refactoring-builder.js";

export const moveStatementsToCallersPython = definePythonRefactoring({
  name: "Move Statements To Callers (Python)",
  kebabName: "move-statements-to-callers-python",
  tier: 3,
  description:
    "Moves the last statement(s) of a function body to each of its call sites.",
  params: [
    pythonParam.file(),
    pythonParam.identifier("target", "Name of the function whose last statement(s) should be moved to call sites"),
    pythonParam.number("count", "Number of statements to move from the end of the function body (default: 1)", false),
  ],
  preconditions(ctx: PythonProjectContext, params: Record<string, unknown>): PreconditionResult {
    const errors: string[] = [];
    const file = params["file"] as string;
    const target = params["target"] as string;
    const count = (params["count"] as number | undefined) ?? 1;

    if (count < 1) {
      errors.push("param 'count' must be >= 1");
    }

    const filePath = path.resolve(ctx.projectRoot, file);
    let source: string;
    try {
      source = readFileSync(filePath, "utf-8");
    } catch {
      errors.push(`File not found: ${file}`);
      return { ok: false, errors };
    }

    const result = validateMoveToCallers(source, target, count);
    if (!result.valid) {
      errors.push(...result.errors);
    }

    return { ok: errors.length === 0, errors };
  },
  apply(ctx: PythonProjectContext, params: Record<string, unknown>): RefactoringResult {
    const file = params["file"] as string;
    const target = params["target"] as string;
    const count = (params["count"] as number | undefined) ?? 1;

    const filePath = path.resolve(ctx.projectRoot, file);

    let source: string;
    try {
      source = readFileSync(filePath, "utf-8");
    } catch {
      return { success: false, filesChanged: [], description: `File not found: ${file}` };
    }

    const result = transformMoveToCallers(source, target, count);

    if (!result.success) {
      return { success: false, filesChanged: [], description: result.error };
    }

    writeFileSync(filePath, result.newSource, "utf-8");

    return {
      success: true,
      filesChanged: [file],
      description: `Moved last ${count} statement(s) of '${target}' to call sites`,
    };
  },
});

interface ValidateResult {
  valid: boolean;
  errors: string[];
}

function validateMoveToCallers(
  source: string,
  target: string,
  count: number,
): ValidateResult {
  const script = `
import ast
import sys
import json

source = sys.stdin.read()
target = ${JSON.stringify(target)}
count = ${count}

errors = []

try:
    tree = ast.parse(source)
except SyntaxError as e:
    print(json.dumps({"valid": False, "errors": [f"Syntax error: {e}"]}))
    sys.exit(0)

# Find the target function
target_func = None
for node in ast.walk(tree):
    if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
        if node.name == target:
            target_func = node
            break

if target_func is None:
    errors.append(f"Function '{target}' not found")
else:
    body = target_func.body
    # Skip docstring
    if body and isinstance(body[0], ast.Expr) and isinstance(getattr(body[0], 'value', None), ast.Constant) and isinstance(body[0].value.value, str):
        body = body[1:]
    if len(body) <= count:
        errors.append(f"Function '{target}' has only {len(body)} statement(s), cannot move {count} (body would be empty)")
    # Find call sites
    calls = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Call):
            if isinstance(node.func, ast.Name) and node.func.id == target:
                calls.append(node)
            elif isinstance(node.func, ast.Attribute) and node.func.attr == target:
                calls.append(node)
    if not calls:
        errors.append(f"No call sites found for '{target}'")

print(json.dumps({"valid": len(errors) == 0, "errors": errors}))
`;

  try {
    const output = execFileSync("python3", ["-c", script], {
      encoding: "utf-8",
      input: source,
      timeout: 10_000,
    }).trim();

    return JSON.parse(output) as ValidateResult;
  } catch (err) {
    return { valid: false, errors: [err instanceof Error ? err.message : String(err)] };
  }
}

interface TransformResult {
  success: boolean;
  newSource: string;
  error: string;
}

function transformMoveToCallers(
  source: string,
  target: string,
  count: number,
): TransformResult {
  const script = `
import ast
import sys
import json
import textwrap

source = sys.stdin.read()
target = ${JSON.stringify(target)}
count = ${count}

try:
    tree = ast.parse(source)
except SyntaxError as e:
    print(json.dumps({"success": False, "error": f"Syntax error: {e}"}))
    sys.exit(0)

lines = source.splitlines(True)

# Find the target function
target_func = None
for node in ast.walk(tree):
    if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
        if node.name == target:
            target_func = node
            break

if target_func is None:
    print(json.dumps({"success": False, "error": f"Function '{target}' not found"}))
    sys.exit(0)

body = target_func.body
# Skip docstring
docstring_offset = 0
if body and isinstance(body[0], ast.Expr) and isinstance(getattr(body[0], 'value', None), ast.Constant) and isinstance(body[0].value.value, str):
    docstring_offset = 1
    body = body[1:]

if len(body) < count:
    print(json.dumps({"success": False, "error": f"Function '{target}' has only {len(body)} statement(s)"}))
    sys.exit(0)

# Extract the last 'count' statements from the function body
stmts_to_move = body[-count:]
move_start = stmts_to_move[0].lineno  # 1-based
move_end = stmts_to_move[-1].end_lineno  # 1-based

# Get the text of the statements to move
moved_lines = lines[move_start - 1:move_end]
moved_text = "".join(moved_lines)

# Find all call sites — expression statements or assignments that call target
# Exclude calls inside the target function itself
target_func_lines = set(range(target_func.lineno, (target_func.end_lineno or target_func.lineno) + 1))
call_sites = []

for node in ast.walk(tree):
    is_call = False
    if isinstance(node, ast.Expr) and isinstance(node.value, ast.Call):
        func = node.value.func
        if (isinstance(func, ast.Name) and func.id == target) or \
           (isinstance(func, ast.Attribute) and func.attr == target):
            is_call = True
    elif isinstance(node, ast.Assign) and isinstance(node.value, ast.Call):
        func = node.value.func
        if (isinstance(func, ast.Name) and func.id == target) or \
           (isinstance(func, ast.Attribute) and func.attr == target):
            is_call = True

    if is_call and node.lineno not in target_func_lines:
        line_text = lines[node.lineno - 1]
        indent = ""
        for ch in line_text:
            if ch in (" ", "\\t"):
                indent += ch
            else:
                break
        call_sites.append({
            "lineno": node.lineno,
            "end_lineno": node.end_lineno or node.lineno,
            "indent": indent,
        })

if not call_sites:
    print(json.dumps({"success": False, "error": f"No call sites found for '{target}'"}))
    sys.exit(0)

# Dedent the moved text and prepare for re-indentation at each call site
dedented = textwrap.dedent(moved_text)

# Apply edits in reverse order of line number to avoid offset issues
# First: insert moved statements after each call site
# Second: remove the statements from the function body

edits = []

# For each call site, insert the moved statements after the call
for site in call_sites:
    re_indented_lines = []
    for line in dedented.splitlines(True):
        if line.strip():
            re_indented_lines.append(site["indent"] + line)
        else:
            re_indented_lines.append(line)
    # Ensure trailing newline
    for i in range(len(re_indented_lines)):
        if re_indented_lines[i] and not re_indented_lines[i].endswith("\\n"):
            re_indented_lines[i] += "\\n"
    edits.append({
        "type": "insert_after",
        "line": site["end_lineno"],  # 1-based, insert after this line
        "text": re_indented_lines,
    })

# Remove the moved statements from the function body
edits.append({
    "type": "delete",
    "start": move_start,  # 1-based
    "end": move_end,      # 1-based
})

# Sort edits by line number descending to apply from bottom to top
edits.sort(key=lambda e: e.get("line", e.get("start", 0)), reverse=True)

new_lines = list(lines)  # Copy
for edit in edits:
    if edit["type"] == "insert_after":
        line_idx = edit["line"]  # 1-based, insert after this line
        for i, txt in enumerate(edit["text"]):
            new_lines.insert(line_idx + i, txt)
    elif edit["type"] == "delete":
        start_idx = edit["start"] - 1  # 0-based
        end_idx = edit["end"]           # 0-based exclusive
        del new_lines[start_idx:end_idx]

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
