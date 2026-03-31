import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import type { PreconditionResult, RefactoringResult } from "../../core/refactoring.types.js";
import { definePythonRefactoring, pythonParam } from "../../python/python-refactoring-builder.js";
import type { PythonProjectContext } from "../../python/python-refactoring-builder.js";

export const combineFunctionsIntoClassPython = definePythonRefactoring({
  name: "Combine Functions Into Class (Python)",
  kebabName: "combine-functions-into-class-python",
  tier: 3,
  description:
    "Groups a set of related top-level functions into a new class as methods, with optional shared-parameter encapsulation.",
  params: [
    pythonParam.file(),
    pythonParam.string("target", "Comma-separated names of the functions to group into a class"),
    pythonParam.identifier("className", "Name for the new class"),
    pythonParam.string(
      "sharedParam",
      "Optional: common first parameter name that becomes self.<field> and the constructor argument",
      false,
    ),
  ],
  preconditions(ctx: PythonProjectContext, params: Record<string, unknown>): PreconditionResult {
    const errors: string[] = [];
    const file = params["file"] as string;
    const target = params["target"] as string;
    const className = params["className"] as string;
    const sharedParam = (params["sharedParam"] as string | undefined) ?? "";

    const filePath = path.resolve(ctx.projectRoot, file);
    let source: string;
    try {
      source = readFileSync(filePath, "utf-8");
    } catch {
      errors.push(`File not found: ${file}`);
      return { ok: false, errors };
    }

    const result = validateCombineFunctions(source, target, className, sharedParam);
    if (!result.valid) {
      errors.push(...result.errors);
    }

    return { ok: errors.length === 0, errors };
  },
  apply(ctx: PythonProjectContext, params: Record<string, unknown>): RefactoringResult {
    const file = params["file"] as string;
    const target = params["target"] as string;
    const className = params["className"] as string;
    const sharedParam = (params["sharedParam"] as string | undefined) ?? "";

    const filePath = path.resolve(ctx.projectRoot, file);

    let source: string;
    try {
      source = readFileSync(filePath, "utf-8");
    } catch {
      return { success: false, filesChanged: [], description: `File not found: ${file}` };
    }

    const result = applyCombineFunctions(source, target, className, sharedParam);

    if (!result.success) {
      return { success: false, filesChanged: [], description: result.error };
    }

    writeFileSync(filePath, result.newSource, "utf-8");

    const filesChanged: string[] = [file];
    const crossFileChanged = updateCrossFileReferences(
      ctx.projectRoot,
      file,
      target,
      className,
      sharedParam,
    );
    filesChanged.push(...crossFileChanged);

    return {
      success: true,
      filesChanged,
      description: `Combined functions [${target}] into new class '${className}'`,
    };
  },
});

interface ValidateResult {
  valid: boolean;
  errors: string[];
}

function validateCombineFunctions(
  source: string,
  target: string,
  className: string,
  sharedParam: string,
): ValidateResult {
  const script = `
import ast
import sys
import json

source = sys.stdin.read()
target = ${JSON.stringify(target)}
class_name = ${JSON.stringify(className)}
shared_param = ${JSON.stringify(sharedParam)}

tree = ast.parse(source)
target_names = [n.strip() for n in target.split(",") if n.strip()]
errors = []

# Check class doesn't already exist
for node in ast.iter_child_nodes(tree):
    if isinstance(node, ast.ClassDef) and node.name == class_name:
        errors.append(f"Class '{class_name}' already exists in file")
        break

# Check all functions exist and shared_param constraint
functions = {}
for node in ast.iter_child_nodes(tree):
    if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name in target_names:
        functions[node.name] = node

for name in target_names:
    if name not in functions:
        errors.append(f"Function '{name}' not found")
    elif shared_param:
        fn = functions[name]
        if not fn.args.args or fn.args.args[0].arg != shared_param:
            errors.append(f"Function '{name}' does not have '{shared_param}' as first parameter")

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

function applyCombineFunctions(
  source: string,
  target: string,
  className: string,
  sharedParam: string,
): TransformResult {
  const script = `
import ast
import sys
import json
import textwrap
import re

source = sys.stdin.read()
target = ${JSON.stringify(target)}
class_name = ${JSON.stringify(className)}
shared_param = ${JSON.stringify(sharedParam)}

tree = ast.parse(source)
lines = source.splitlines(True)
target_names = [n.strip() for n in target.split(",") if n.strip()]
target_set = set(target_names)

# Find all target functions
functions = {}
for node in ast.iter_child_nodes(tree):
    if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name in target_set:
        functions[node.name] = node

if len(functions) != len(target_names):
    missing = [n for n in target_names if n not in functions]
    print(json.dumps({"success": False, "error": f"Functions not found: {missing}", "newSource": ""}))
    sys.exit(0)

# Track line ranges of target functions to exclude intra-function call rewrites
fn_line_ranges = {name: (fn.lineno, fn.end_lineno) for name, fn in functions.items()}

def is_in_target_fn(node):
    for start, end in fn_line_ranges.values():
        if start <= node.lineno <= end:
            return True
    return False

indent = "    "

def build_method(fn_name):
    fn = functions[fn_name]
    body_lines_raw = lines[fn.body[0].lineno - 1:fn.body[-1].end_lineno]
    body_text = textwrap.dedent("".join(body_lines_raw))

    if shared_param:
        # Replace shared_param refs with self.shared_param
        body_text = re.sub(r'\\b' + re.escape(shared_param) + r'\\b', f'self.{shared_param}', body_text)
        # Rewrite intra-class calls after the substitution has happened:
        # other_fn(self.shared_param) → self.other_fn()
        # other_fn(self.shared_param, rest) → self.other_fn(rest)
        for other_name in target_set:
            body_text = re.sub(
                r'\\b' + re.escape(other_name) + r'\\(self\\.' + re.escape(shared_param) + r'\\)',
                f'self.{other_name}()',
                body_text,
            )
            body_text = re.sub(
                r'\\b' + re.escape(other_name) + r'\\(self\\.' + re.escape(shared_param) + r',\\s*',
                f'self.{other_name}(',
                body_text,
            )

    # Build parameter list (excluding shared_param if applicable)
    fn_args = fn.args
    if shared_param:
        positional = fn_args.args[1:]  # skip first param
        # Adjust defaults offset: defaults align to END of all args, not just positional
        # fn_args.defaults has len <= len(fn_args.args); skip the default for sharedParam if it had one
        # Since sharedParam is the first positional arg, the defaults list is for the last N args
        num_all = len(fn_args.args)
        num_defaults = len(fn_args.defaults)
        # defaults[i] corresponds to args[num_all - num_defaults + i]
        # After removing first arg, positional[i] corresponds to args[i+1]
        # For positional[i] (= args[i+1]), default index = (i+1) - (num_all - num_defaults) = i+1-num_all+num_defaults
        new_positional = positional
    else:
        new_positional = fn_args.args
        num_all = len(fn_args.args)
        num_defaults = len(fn_args.defaults)

    param_parts = []
    num_new = len(new_positional)
    for i, arg in enumerate(new_positional):
        # Calculate original index in fn_args.args
        if shared_param:
            orig_idx = i + 1
        else:
            orig_idx = i
        ann = ""
        if arg.annotation:
            ann_text = ast.get_source_segment(source, arg.annotation)
            if ann_text:
                ann = f": {ann_text}"
        part = arg.arg + ann
        # Default index: defaults[orig_idx - (num_all - num_defaults)]
        default_idx = orig_idx - (num_all - num_defaults)
        if 0 <= default_idx < num_defaults:
            default_text = ast.get_source_segment(source, fn_args.defaults[default_idx])
            if default_text:
                part += f" = {default_text}"
        param_parts.append(part)

    # Also handle *args and **kwargs
    if fn_args.vararg:
        varg = fn_args.vararg
        vann = ""
        if varg.annotation:
            ann_text = ast.get_source_segment(source, varg.annotation)
            if ann_text:
                vann = f": {ann_text}"
        param_parts.append(f"*{varg.arg}{vann}")
    for kwarg_arg in fn_args.kwonlyargs:
        ann = ""
        if kwarg_arg.annotation:
            ann_text = ast.get_source_segment(source, kwarg_arg.annotation)
            if ann_text:
                ann = f": {ann_text}"
        param_parts.append(kwarg_arg.arg + ann)
    if fn_args.kwarg:
        kwarg = fn_args.kwarg
        kann = ""
        if kwarg.annotation:
            ann_text = ast.get_source_segment(source, kwarg.annotation)
            if ann_text:
                kann = f": {ann_text}"
        param_parts.append(f"**{kwarg.arg}{kann}")

    params_str = ", ".join(param_parts)
    if params_str:
        method_params = f"self, {params_str}"
    else:
        method_params = "self"

    is_async = isinstance(fn, ast.AsyncFunctionDef)
    async_prefix = "async " if is_async else ""

    ret_ann = ""
    if fn.returns:
        ret_text = ast.get_source_segment(source, fn.returns)
        if ret_text:
            ret_ann = f" -> {ret_text}"

    # Handle decorators
    decorator_lines = []
    for dec in fn.decorator_list:
        dec_text = ast.get_source_segment(source, dec)
        if dec_text:
            decorator_lines.append(f"{indent}@{dec_text}")

    method_sig = f"{indent}{async_prefix}def {fn_name}({method_params}){ret_ann}:"
    indented_body = textwrap.indent(body_text.rstrip(), indent * 2)

    parts = decorator_lines + [method_sig, indented_body]
    return "\\n".join(parts)

# Build class parts
class_parts = []

if shared_param:
    # Generate __init__ from shared_param (with type annotation if first function has one)
    first_fn = functions[target_names[0]]
    sp_ann = ""
    if first_fn.args.args and first_fn.args.args[0].annotation:
        ann_text = ast.get_source_segment(source, first_fn.args.args[0].annotation)
        if ann_text:
            sp_ann = f": {ann_text}"
    init_body = f"{indent}{indent}self.{shared_param} = {shared_param}"
    init_sig = f"{indent}def __init__(self, {shared_param}{sp_ann}):"
    class_parts.append(init_sig + "\\n" + init_body)

for fn_name in target_names:
    class_parts.append(build_method(fn_name))

class_text = f"class {class_name}:\\n" + "\\n\\n".join(class_parts) + "\\n"

# Collect external call-site edits (skip calls inside target functions)
edits = []
for node in ast.walk(tree):
    if not isinstance(node, ast.Call):
        continue
    if not isinstance(node.func, ast.Name):
        continue
    if node.func.id not in target_set:
        continue
    if is_in_target_fn(node):
        continue

    fn_name = node.func.id

    if shared_param:
        # fn(shared_val, rest...) → ClassName(shared_val).fn(rest...)
        if not node.args:
            continue
        shared_val = ast.get_source_segment(source, node.args[0])
        if not shared_val:
            continue
        rest_args = [ast.get_source_segment(source, a) for a in node.args[1:]]
        rest_kwargs = []
        for kw in node.keywords:
            if kw.arg:
                val_text = ast.get_source_segment(source, kw.value)
                if val_text:
                    rest_kwargs.append(f"{kw.arg}={val_text}")
            else:
                val_text = ast.get_source_segment(source, kw.value)
                if val_text:
                    rest_kwargs.append(f"**{val_text}")
        all_rest = [a for a in rest_args if a] + rest_kwargs
        new_call = f"{class_name}({shared_val}).{fn_name}({', '.join(all_rest)})"
    else:
        # fn(args...) → ClassName().fn(args...)
        arg_texts = [ast.get_source_segment(source, a) for a in node.args]
        kwarg_texts = []
        for kw in node.keywords:
            if kw.arg:
                val_text = ast.get_source_segment(source, kw.value)
                if val_text:
                    kwarg_texts.append(f"{kw.arg}={val_text}")
            else:
                val_text = ast.get_source_segment(source, kw.value)
                if val_text:
                    kwarg_texts.append(f"**{val_text}")
        all_args = [a for a in arg_texts if a] + kwarg_texts
        new_call = f"{class_name}().{fn_name}({', '.join(all_args)})"

    edits.append({
        "start_line": node.lineno - 1,
        "start_col": node.col_offset,
        "end_line": node.end_lineno - 1,
        "end_col": node.end_col_offset,
        "replacement": new_call,
    })

# Sort edits bottom-to-top and apply
edits.sort(key=lambda e: (e["start_line"], e["start_col"]), reverse=True)
new_lines = list(lines)

for edit in edits:
    sl = edit["start_line"]
    sc = edit["start_col"]
    el = edit["end_line"]
    ec = edit["end_col"]
    repl = edit["replacement"]
    if sl == el:
        line = new_lines[sl]
        new_lines[sl] = line[:sc] + repl + line[ec:]
    else:
        first_line = new_lines[sl]
        last_line = new_lines[el]
        new_lines[sl] = first_line[:sc] + repl + last_line[ec:]
        for i in range(el, sl, -1):
            del new_lines[i]

# Re-parse to find updated function positions for removal
new_source_tmp = "".join(new_lines)
try:
    new_tree = ast.parse(new_source_tmp)
except Exception:
    new_tree = None

fn_ranges = []
if new_tree:
    for node in ast.iter_child_nodes(new_tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name in target_set:
            start = node.lineno - 1
            if node.decorator_list:
                start = node.decorator_list[0].lineno - 1
            fn_ranges.append((start, node.end_lineno))

# Remove functions bottom-to-top
fn_ranges.sort(key=lambda r: r[0], reverse=True)
for start, end in fn_ranges:
    # Strip preceding blank lines
    while start > 0 and new_lines[start - 1].strip() == "":
        start -= 1
    del new_lines[start:end]

# Add class at end of file
while new_lines and new_lines[-1].strip() == "":
    new_lines.pop()
new_lines.append("\\n\\n" + class_text)

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
  target: string,
  className: string,
  sharedParam: string,
): string[] {
  const script = `
import ast
import sys
import json
import os
import glob

project_root = ${JSON.stringify(projectRoot)}
source_file = ${JSON.stringify(sourceFile)}
target = ${JSON.stringify(target)}
class_name = ${JSON.stringify(className)}
shared_param = ${JSON.stringify(sharedParam)}

target_names = [n.strip() for n in target.split(",") if n.strip()]
target_set = set(target_names)

source_module = os.path.splitext(source_file)[0].replace(os.sep, ".")
source_base = os.path.splitext(source_file)[0]

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

    # Find import nodes that import any of the target functions
    imported_names = {}  # original_name -> local_alias
    import_nodes = []

    for node in ast.iter_child_nodes(tree):
        if not isinstance(node, ast.ImportFrom):
            continue
        mod = node.module or ""
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

    # Rewrite import lines: replace target function names with class name
    # Group all import nodes from the same module
    for imp_node in sorted(import_nodes, key=lambda n: n.lineno, reverse=True):
        imp_start = imp_node.lineno - 1
        imp_end = imp_node.end_lineno
        imp_text = "".join(lines[imp_start:imp_end])

        # Remove target function names from import, add class_name
        new_names = []
        for alias in imp_node.names:
            if alias.name not in target_set:
                if alias.asname:
                    new_names.append(f"{alias.name} as {alias.asname}")
                else:
                    new_names.append(alias.name)

        # Add class_name if not already in this import
        class_already_imported = any(a.name == class_name for a in imp_node.names)
        if not class_already_imported:
            new_names.append(class_name)

        if new_names:
            mod_text = imp_node.module or ""
            new_imp = f"from {mod_text} import {', '.join(new_names)}\\n"
        else:
            new_imp = ""

        lines[imp_start:imp_end] = [new_imp] if new_imp else []

    # Re-parse with updated imports to find call sites
    new_content = "".join(lines)
    try:
        new_tree = ast.parse(new_content)
    except Exception:
        continue

    new_lines = new_content.splitlines(True)
    edits = []

    for node in ast.walk(new_tree):
        if not isinstance(node, ast.Call):
            continue
        if not isinstance(node.func, ast.Name):
            continue
        local_name = node.func.id
        # Find which original function this alias maps to
        orig_name = None
        for oname, alias in imported_names.items():
            if alias == local_name:
                orig_name = oname
                break
        if orig_name is None:
            continue

        if shared_param:
            if not node.args:
                continue
            shared_val = ast.get_source_segment(new_content, node.args[0])
            if not shared_val:
                continue
            rest_args = [ast.get_source_segment(new_content, a) for a in node.args[1:]]
            rest_kwargs = []
            for kw in node.keywords:
                if kw.arg:
                    val_text = ast.get_source_segment(new_content, kw.value)
                    if val_text:
                        rest_kwargs.append(f"{kw.arg}={val_text}")
            all_rest = [a for a in rest_args if a] + rest_kwargs
            new_call = f"{class_name}({shared_val}).{orig_name}({', '.join(all_rest)})"
        else:
            arg_texts = [ast.get_source_segment(new_content, a) for a in node.args]
            kwarg_texts = []
            for kw in node.keywords:
                if kw.arg:
                    val_text = ast.get_source_segment(new_content, kw.value)
                    if val_text:
                        kwarg_texts.append(f"{kw.arg}={val_text}")
            all_args = [a for a in arg_texts if a] + kwarg_texts
            new_call = f"{class_name}().{orig_name}({', '.join(all_args)})"

        edits.append({
            "start_line": node.lineno - 1,
            "start_col": node.col_offset,
            "end_line": node.end_lineno - 1,
            "end_col": node.end_col_offset,
            "replacement": new_call,
        })

    edits.sort(key=lambda e: (e["start_line"], e["start_col"]), reverse=True)

    for edit in edits:
        sl = edit["start_line"]
        sc = edit["start_col"]
        el = edit["end_line"]
        ec = edit["end_col"]
        repl = edit["replacement"]
        if sl == el:
            line = new_lines[sl]
            new_lines[sl] = line[:sc] + repl + line[ec:]
        else:
            first_line = new_lines[sl]
            last_line = new_lines[el]
            new_lines[sl] = first_line[:sc] + repl + last_line[ec:]
            for i in range(el, sl, -1):
                del new_lines[i]

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
