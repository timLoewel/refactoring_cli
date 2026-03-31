import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import type { PreconditionResult, RefactoringResult } from "../../core/refactoring.types.js";
import { definePythonRefactoring, pythonParam } from "../../python/python-refactoring-builder.js";
import type { PythonProjectContext } from "../../python/python-refactoring-builder.js";

export const combineFunctionsIntoTransformPython = definePythonRefactoring({
  name: "Combine Functions Into Transform (Python)",
  kebabName: "combine-functions-into-transform-python",
  tier: 3,
  description:
    "Creates a new transform function that pipes a data record through a sequence of enrichment functions.",
  params: [
    pythonParam.file(),
    pythonParam.string("functions", "Comma-separated names of the functions to pipeline (in order)"),
    pythonParam.identifier("name", "Name for the new transform function"),
  ],
  preconditions(ctx: PythonProjectContext, params: Record<string, unknown>): PreconditionResult {
    const errors: string[] = [];
    const file = params["file"] as string;
    const functions = params["functions"] as string;
    const name = params["name"] as string;

    const filePath = path.resolve(ctx.projectRoot, file);
    let source: string;
    try {
      source = readFileSync(filePath, "utf-8");
    } catch {
      errors.push(`File not found: ${file}`);
      return { ok: false, errors };
    }

    const result = validateTransform(source, functions, name);
    if (!result.valid) {
      errors.push(...result.errors);
    }

    return { ok: errors.length === 0, errors };
  },
  apply(ctx: PythonProjectContext, params: Record<string, unknown>): RefactoringResult {
    const file = params["file"] as string;
    const functions = params["functions"] as string;
    const name = params["name"] as string;

    const filePath = path.resolve(ctx.projectRoot, file);

    let source: string;
    try {
      source = readFileSync(filePath, "utf-8");
    } catch {
      return { success: false, filesChanged: [], description: `File not found: ${file}` };
    }

    const result = applyTransform(source, functions, name);

    if (!result.success) {
      return { success: false, filesChanged: [], description: result.error };
    }

    writeFileSync(filePath, result.newSource, "utf-8");

    const filesChanged: string[] = [file];
    const crossFileChanged = updateCrossFileReferences(ctx.projectRoot, file, functions, name);
    filesChanged.push(...crossFileChanged);

    return {
      success: true,
      filesChanged,
      description: `Created transform function '${name}' that pipelines: ${functions}`,
    };
  },
});

interface ValidateResult {
  valid: boolean;
  errors: string[];
}

function validateTransform(source: string, functions: string, name: string): ValidateResult {
  const script = `
import ast
import sys
import json

source = sys.stdin.read()
functions = ${JSON.stringify(functions)}
name = ${JSON.stringify(name)}

tree = ast.parse(source)
target_names = [n.strip() for n in functions.split(",") if n.strip()]
errors = []

if len(target_names) < 2:
    errors.append("At least two function names must be provided")

# Check transform name doesn't already exist
for node in ast.iter_child_nodes(tree):
    if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name == name:
        errors.append(f"A function named '{name}' already exists in file")
        break

# Check all functions exist and have at least one parameter (the record)
for fn_name in target_names:
    found = False
    for node in ast.iter_child_nodes(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name == fn_name:
            found = True
            if not node.args.args:
                errors.append(f"Function '{fn_name}' must have at least one parameter (the record)")
            break
    if not found:
        errors.append(f"Function '{fn_name}' not found")

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

function applyTransform(source: string, functions: string, name: string): TransformResult {
  const script = `
import ast
import sys
import json
import textwrap

source = sys.stdin.read()
functions = ${JSON.stringify(functions)}
transform_name = ${JSON.stringify(name)}

tree = ast.parse(source)
lines = source.splitlines(True)
target_names = [n.strip() for n in functions.split(",") if n.strip()]
target_set = set(target_names)

# Find all target functions
fn_nodes = {}
for node in ast.iter_child_nodes(tree):
    if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name in target_set:
        fn_nodes[node.name] = node

if len(fn_nodes) != len(target_names):
    missing = [n for n in target_names if n not in fn_nodes]
    print(json.dumps({"success": False, "error": f"Functions not found: {missing}", "newSource": ""}))
    sys.exit(0)

# Get the first param (record param) name and type annotation from the first function
first_fn = fn_nodes[target_names[0]]
record_param = first_fn.args.args[0].arg
record_ann = ""
if first_fn.args.args[0].annotation:
    ann_text = ast.get_source_segment(source, first_fn.args.args[0].annotation)
    if ann_text:
        record_ann = f": {ann_text}"

# Get return type annotation from the last function (if present)
last_fn = fn_nodes[target_names[-1]]
ret_ann = ""
if last_fn.returns:
    ret_text = ast.get_source_segment(source, last_fn.returns)
    if ret_text:
        ret_ann = f" -> {ret_text}"

# Build transform function body: pipe record through each function
indent = "    "
body_lines = []
for fn_name in target_names:
    body_lines.append(f"{indent}{record_param} = {fn_name}({record_param})")
body_lines.append(f"{indent}return {record_param}")

transform_text = f"def {transform_name}({record_param}{record_ann}){ret_ann}:\\n"
transform_text += "\\n".join(body_lines) + "\\n"

# --- Call chain rewriting ---
# Find sequences: var = f1(x); var = f2(var); ... in order
# Replace with: var = transform_name(x)

def find_call_chains(stmts):
    """Return list of (start_idx, end_idx, chain_var, initial_arg_text) for found chains."""
    chains = []
    i = 0
    while i < len(stmts):
        stmt = stmts[i]
        # First stmt must be: var = fn1(initial_arg)
        if not isinstance(stmt, ast.Assign):
            i += 1
            continue
        if not isinstance(stmt.value, ast.Call):
            i += 1
            continue
        if not isinstance(stmt.value.func, ast.Name):
            i += 1
            continue
        if stmt.value.func.id != target_names[0]:
            i += 1
            continue
        if len(stmt.targets) != 1 or not isinstance(stmt.targets[0], ast.Name):
            i += 1
            continue
        if not stmt.value.args:
            i += 1
            continue

        chain_var = stmt.targets[0].id
        initial_arg = ast.get_source_segment(source, stmt.value.args[0])
        if not initial_arg:
            i += 1
            continue

        # Match subsequent stmts: var = fn_k(var)
        j = i + 1
        fn_idx = 1
        while fn_idx < len(target_names) and j < len(stmts):
            next_stmt = stmts[j]
            if not isinstance(next_stmt, ast.Assign):
                break
            if not isinstance(next_stmt.value, ast.Call):
                break
            if not isinstance(next_stmt.value.func, ast.Name):
                break
            if next_stmt.value.func.id != target_names[fn_idx]:
                break
            if len(next_stmt.targets) != 1 or not isinstance(next_stmt.targets[0], ast.Name):
                break
            if next_stmt.targets[0].id != chain_var:
                break
            if not next_stmt.value.args or not isinstance(next_stmt.value.args[0], ast.Name):
                break
            if next_stmt.value.args[0].id != chain_var:
                break
            fn_idx += 1
            j += 1

        if fn_idx == len(target_names):
            chains.append((i, j, chain_var, initial_arg, stmt, stmts[j - 1]))

        i += 1
    return chains

# Collect line-level edits for call chains
chain_edits = []

def collect_chains_in_body(stmts):
    chains = find_call_chains(stmts)
    for (_, _, chain_var, initial_arg, first_stmt, last_stmt) in chains:
        first_line_text = lines[first_stmt.lineno - 1]
        stmt_indent = first_line_text[:len(first_line_text) - len(first_line_text.lstrip())]
        replacement = f"{stmt_indent}{chain_var} = {transform_name}({initial_arg})\\n"
        chain_edits.append({
            "start_line": first_stmt.lineno - 1,
            "end_line": last_stmt.end_lineno,
            "replacement": replacement,
        })
    # Recurse into nested blocks
    for stmt in stmts:
        for attr in ("body", "orelse", "finalbody", "handlers"):
            block = getattr(stmt, attr, None)
            if isinstance(block, list) and block:
                collect_chains_in_body(block)
        if hasattr(stmt, "handlers"):
            for handler in stmt.handlers:
                collect_chains_in_body(handler.body)

collect_chains_in_body(tree.body)

# Apply chain edits (bottom-to-top)
chain_edits.sort(key=lambda e: e["start_line"], reverse=True)
new_lines = list(lines)

for edit in chain_edits:
    sl = edit["start_line"]
    el = edit["end_line"]  # exclusive end (end_lineno is 1-indexed last line, so end_line = end_lineno)
    repl = edit["replacement"]
    new_lines[sl:el] = [repl]

# Add transform function at end of file
while new_lines and new_lines[-1].strip() == "":
    new_lines.pop()
new_lines.append("\\n\\n" + transform_text)

new_source = "".join(new_lines)
print(json.dumps({"success": True, "newSource": new_source, "error": ""}))
`;

  try {
    const output = execFileSync("python3", ["-c", script], {
      encoding: "utf-8",
      input: source,
      timeout: 15_000,
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

function updateCrossFileReferences(
  projectRoot: string,
  sourceFile: string,
  functions: string,
  transformName: string,
): string[] {
  const script = `
import ast
import sys
import json
import os
import glob

project_root = ${JSON.stringify(projectRoot)}
source_file = ${JSON.stringify(sourceFile)}
functions = ${JSON.stringify(functions)}
transform_name = ${JSON.stringify(transformName)}

target_names = [n.strip() for n in functions.split(",") if n.strip()]
target_set = set(target_names)
source_base = os.path.splitext(source_file)[0].replace(os.sep, ".")

py_files = glob.glob(os.path.join(project_root, "**/*.py"), recursive=True)
changed_files = []

for py_file in py_files:
    rel_path = os.path.relpath(py_file, project_root)
    if rel_path == source_file:
        continue
    try:
        content = open(py_file).read()
        tree = ast.parse(content)
    except Exception:
        continue

    # Find ImportFrom nodes that import any of the target functions from source module
    imported_names = {}  # original_name -> local_alias
    import_nodes = []

    for node in ast.iter_child_nodes(tree):
        if not isinstance(node, ast.ImportFrom):
            continue
        mod = node.module or ""
        # Match exact module name or submodule ending
        if mod != source_base and not mod.endswith("." + source_base):
            continue
        for alias in node.names:
            if alias.name in target_set:
                imported_names[alias.name] = alias.asname or alias.name
                if node not in import_nodes:
                    import_nodes.append(node)

    if not import_nodes:
        continue

    lines = content.splitlines(True)

    # Rewrite import lines: add transform_name to imports
    for imp_node in sorted(import_nodes, key=lambda n: n.lineno, reverse=True):
        imp_start = imp_node.lineno - 1
        imp_end = imp_node.end_lineno
        new_names = []
        for alias in imp_node.names:
            if alias.asname:
                new_names.append(f"{alias.name} as {alias.asname}")
            else:
                new_names.append(alias.name)
        # Add transform_name if not already imported
        if not any(a.name == transform_name for a in imp_node.names):
            new_names.append(transform_name)
        mod_text = imp_node.module or ""
        new_imp = f"from {mod_text} import {', '.join(new_names)}\\n"
        lines[imp_start:imp_end] = [new_imp]

    # Re-parse with updated imports to find call chains
    new_content = "".join(lines)
    try:
        new_tree = ast.parse(new_content)
    except Exception:
        continue

    new_lines = new_content.splitlines(True)

    def find_call_chains_in(stmts, src):
        chains = []
        i = 0
        while i < len(stmts):
            stmt = stmts[i]
            if not isinstance(stmt, ast.Assign):
                i += 1
                continue
            if not isinstance(stmt.value, ast.Call):
                i += 1
                continue
            if not isinstance(stmt.value.func, ast.Name):
                i += 1
                continue
            if stmt.value.func.id != target_names[0]:
                i += 1
                continue
            if len(stmt.targets) != 1 or not isinstance(stmt.targets[0], ast.Name):
                i += 1
                continue
            if not stmt.value.args:
                i += 1
                continue
            chain_var = stmt.targets[0].id
            initial_arg = ast.get_source_segment(src, stmt.value.args[0])
            if not initial_arg:
                i += 1
                continue
            j = i + 1
            fn_idx = 1
            while fn_idx < len(target_names) and j < len(stmts):
                ns = stmts[j]
                if not isinstance(ns, ast.Assign):
                    break
                if not isinstance(ns.value, ast.Call):
                    break
                if not isinstance(ns.value.func, ast.Name):
                    break
                if ns.value.func.id != target_names[fn_idx]:
                    break
                if len(ns.targets) != 1 or not isinstance(ns.targets[0], ast.Name):
                    break
                if ns.targets[0].id != chain_var:
                    break
                if not ns.value.args or not isinstance(ns.value.args[0], ast.Name):
                    break
                if ns.value.args[0].id != chain_var:
                    break
                fn_idx += 1
                j += 1
            if fn_idx == len(target_names):
                chains.append((chain_var, initial_arg, stmt, stmts[j - 1]))
            i += 1
        return chains

    chain_edits = []

    def collect_chains(stmts, src):
        for (chain_var, initial_arg, first_stmt, last_stmt) in find_call_chains_in(stmts, src):
            first_line_text = new_lines[first_stmt.lineno - 1]
            stmt_indent = first_line_text[:len(first_line_text) - len(first_line_text.lstrip())]
            replacement = f"{stmt_indent}{chain_var} = {transform_name}({initial_arg})\\n"
            chain_edits.append({
                "start_line": first_stmt.lineno - 1,
                "end_line": last_stmt.end_lineno,
                "replacement": replacement,
            })
        for stmt in stmts:
            for attr in ("body", "orelse"):
                block = getattr(stmt, attr, None)
                if isinstance(block, list) and block:
                    collect_chains(block, src)
            if hasattr(stmt, "handlers"):
                for handler in stmt.handlers:
                    collect_chains(handler.body, src)

    collect_chains(new_tree.body, new_content)

    chain_edits.sort(key=lambda e: e["start_line"], reverse=True)
    for edit in chain_edits:
        sl = edit["start_line"]
        el = edit["end_line"]
        repl = edit["replacement"]
        new_lines[sl:el] = [repl]

    final_content = "".join(new_lines)
    with open(py_file, "w") as f:
        f.write(final_content)
    changed_files.append(rel_path)

print(json.dumps(changed_files))
`;

  try {
    const output = execFileSync("python3", ["-c", script], {
      encoding: "utf-8",
      timeout: 15_000,
    }).trim();

    return JSON.parse(output) as string[];
  } catch {
    return [];
  }
}
