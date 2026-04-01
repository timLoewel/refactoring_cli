import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import type { PreconditionResult, RefactoringResult } from "../../core/refactoring.types.js";
import { definePythonRefactoring, pythonParam } from "../../python/python-refactoring-builder.js";
import type { PythonProjectContext } from "../../python/python-refactoring-builder.js";

export const splitPhasePython = definePythonRefactoring({
  name: "Split Phase (Python)",
  kebabName: "split-phase-python",
  tier: 2,
  description:
    "Splits a function into two sequential phase functions and updates the original to delegate to them.",
  params: [
    pythonParam.file(),
    pythonParam.identifier("target", "Name of the function to split into two phases"),
    pythonParam.identifier("firstPhaseName", "Name for the first phase function"),
    pythonParam.identifier("secondPhaseName", "Name for the second phase function"),
  ],
  preconditions(ctx: PythonProjectContext, params: Record<string, unknown>): PreconditionResult {
    const errors: string[] = [];
    const file = params["file"] as string;
    const target = params["target"] as string;
    const firstPhaseName = params["firstPhaseName"] as string;
    const secondPhaseName = params["secondPhaseName"] as string;

    const filePath = path.resolve(ctx.projectRoot, file);
    let source: string;
    try {
      source = readFileSync(filePath, "utf-8");
    } catch {
      errors.push(`File not found: ${file}`);
      return { ok: false, errors };
    }

    const result = validateSplitPhase(source, target, firstPhaseName, secondPhaseName);
    if (!result.valid) {
      errors.push(...result.errors);
    }

    return { ok: errors.length === 0, errors };
  },
  apply(ctx: PythonProjectContext, params: Record<string, unknown>): RefactoringResult {
    const file = params["file"] as string;
    const target = params["target"] as string;
    const firstPhaseName = params["firstPhaseName"] as string;
    const secondPhaseName = params["secondPhaseName"] as string;

    const filePath = path.resolve(ctx.projectRoot, file);
    let source: string;
    try {
      source = readFileSync(filePath, "utf-8");
    } catch {
      return { success: false, filesChanged: [], description: `File not found: ${file}` };
    }

    const result = applySplitPhase(source, target, firstPhaseName, secondPhaseName);
    if (!result.success) {
      return { success: false, filesChanged: [], description: result.error };
    }

    writeFileSync(filePath, result.newSource, "utf-8");

    return {
      success: true,
      filesChanged: [file],
      description: `Split function '${target}' into '${firstPhaseName}' and '${secondPhaseName}'`,
    };
  },
});

interface ValidationResult {
  valid: boolean;
  errors: string[];
}

interface TransformResult {
  success: boolean;
  newSource: string;
  error: string;
}

function validateSplitPhase(
  source: string,
  target: string,
  firstPhaseName: string,
  secondPhaseName: string,
): ValidationResult {
  const script = `
import ast, json, sys

source = sys.stdin.read()
target = ${JSON.stringify(target)}
first_phase = ${JSON.stringify(firstPhaseName)}
second_phase = ${JSON.stringify(secondPhaseName)}

try:
    tree = ast.parse(source)
except SyntaxError as e:
    print(json.dumps({"valid": False, "errors": [f"Syntax error: {e}"]}))
    sys.exit(0)

errors = []

# Find the target function at module level
target_fn = None
for node in tree.body:
    if isinstance(node, ast.FunctionDef) and node.name == target:
        target_fn = node
        break

if target_fn is None:
    errors.append(f"Function '{target}' not found at module level")
    print(json.dumps({"valid": len(errors) == 0, "errors": errors}))
    sys.exit(0)

body_stmts = target_fn.body
if len(body_stmts) < 2:
    errors.append(f"Function '{target}' must have at least 2 statements to split into two phases")

# Check for naming conflicts
top_level_names = {node.name for node in tree.body if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef))}
for name in [first_phase, second_phase]:
    if name in top_level_names:
        errors.append(f"A function named '{name}' already exists in the file")

print(json.dumps({"valid": len(errors) == 0, "errors": errors}))
`;

  try {
    const output = execFileSync("python3", ["-c", script], {
      encoding: "utf-8",
      input: source,
      timeout: 10_000,
    }).trim();

    return JSON.parse(output) as ValidationResult;
  } catch (err) {
    return {
      valid: false,
      errors: [err instanceof Error ? err.message : String(err)],
    };
  }
}

function applySplitPhase(
  source: string,
  target: string,
  firstPhaseName: string,
  secondPhaseName: string,
): TransformResult {
  const script = `
import ast, json, sys, textwrap

source = sys.stdin.read()
target = ${JSON.stringify(target)}
first_phase = ${JSON.stringify(firstPhaseName)}
second_phase = ${JSON.stringify(secondPhaseName)}

tree = ast.parse(source)
lines = source.splitlines(True)

# Find the target function
target_fn = None
for node in tree.body:
    if isinstance(node, ast.FunctionDef) and node.name == target:
        target_fn = node
        break

if target_fn is None:
    print(json.dumps({"success": False, "error": f"Function '{target}' not found"}))
    sys.exit(0)

body_stmts = target_fn.body
if len(body_stmts) < 2:
    print(json.dumps({"success": False, "error": f"Function '{target}' needs at least 2 statements"}))
    sys.exit(0)

# Build parameter signature text
args = target_fn.args
params_parts = []
for i, arg in enumerate(args.args):
    ann = ast.get_source_segment(source, arg.annotation) if arg.annotation else None
    part = f"{arg.arg}: {ann}" if ann else arg.arg
    params_parts.append(part)
for i, arg in enumerate(args.posonlyargs):
    ann = ast.get_source_segment(source, arg.annotation) if arg.annotation else None
    part = f"{arg.arg}: {ann}" if ann else arg.arg
    params_parts.append(part)
if args.vararg:
    params_parts.append(f"*{args.vararg.arg}")
for arg in args.kwonlyargs:
    ann = ast.get_source_segment(source, arg.annotation) if arg.annotation else None
    part = f"{arg.arg}: {ann}" if ann else arg.arg
    params_parts.append(part)
if args.kwarg:
    params_parts.append(f"**{args.kwarg.arg}")
params_sig = ", ".join(params_parts)

# Argument names only (for call site)
call_args = [arg.arg for arg in args.args]
call_args_sig = ", ".join(call_args)

# Split the body at the midpoint
midpoint = len(body_stmts) // 2
first_stmts = body_stmts[:midpoint]
second_stmts = body_stmts[midpoint:]

# Extract source text for each group
def stmts_source(stmts):
    start = stmts[0].lineno - 1
    end = stmts[-1].end_lineno
    raw = "".join(lines[start:end])
    return textwrap.dedent(raw).rstrip("\\n")

first_body = stmts_source(first_stmts)
second_body = stmts_source(second_stmts)

# Build the two new phase functions
def build_func(name, params_sig, body):
    indented = textwrap.indent(body, "    ")
    return f"def {name}({params_sig}):\\n{indented}\\n"

first_func = build_func(first_phase, params_sig, first_body)
second_func = build_func(second_phase, params_sig, second_body)

# Replace the original function body: just call both phases
fn_body_start = target_fn.body[0].lineno - 1  # 0-indexed
fn_body_end = target_fn.end_lineno  # 1-indexed end = exclusive slice end

call_indent = " " * target_fn.body[0].col_offset
new_body_lines = [
    f"{call_indent}{first_phase}({call_args_sig})\\n",
    f"{call_indent}{second_phase}({call_args_sig})\\n",
]

new_lines = list(lines)
new_lines[fn_body_start:fn_body_end] = new_body_lines

# Append the two phase functions after the file
if new_lines and new_lines[-1].endswith("\\n"):
    new_lines.append("\\n")
new_lines.append("\\n" + first_func)
new_lines.append("\\n" + second_func)

new_source = "".join(new_lines)

try:
    ast.parse(new_source)
except SyntaxError as e:
    print(json.dumps({"success": False, "error": f"Generated invalid Python: {e}"}))
    sys.exit(0)

print(json.dumps({"success": True, "newSource": new_source}))
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
