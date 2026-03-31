import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import type { PreconditionResult, RefactoringResult } from "../../core/refactoring.types.js";
import { definePythonRefactoring, pythonParam } from "../../python/python-refactoring-builder.js";
import type { PythonProjectContext } from "../../python/python-refactoring-builder.js";

export const replaceFunctionWithCommandPython = definePythonRefactoring({
  name: "Replace Function With Command (Python)",
  kebabName: "replace-function-with-command-python",
  tier: 2,
  description:
    "Converts a standalone function into a command class with an execute method, enabling richer state management.",
  params: [
    pythonParam.file(),
    pythonParam.identifier(
      "target",
      "Name of the function to convert into a command class",
    ),
    pythonParam.identifier(
      "className",
      "Name for the new command class",
    ),
    pythonParam.string(
      "style",
      "Class style: 'regular' (default) or 'dataclass'",
      false,
    ),
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

    const result = validateFunction(source, target);
    if (!result.valid) {
      errors.push(result.error);
    }

    return { ok: errors.length === 0, errors };
  },
  apply(ctx: PythonProjectContext, params: Record<string, unknown>): RefactoringResult {
    const file = params["file"] as string;
    const target = params["target"] as string;
    const className = params["className"] as string;
    const style = (params["style"] as string) || "regular";

    const filePath = path.resolve(ctx.projectRoot, file);

    let source: string;
    try {
      source = readFileSync(filePath, "utf-8");
    } catch {
      return { success: false, filesChanged: [], description: `File not found: ${file}` };
    }

    const result = replaceFunctionWithCommand(source, target, className, style);

    if (!result.success) {
      return { success: false, filesChanged: [], description: result.error };
    }

    writeFileSync(filePath, result.newSource, "utf-8");

    return {
      success: true,
      filesChanged: [file],
      description: `Converted function '${target}' into command class '${className}'`,
    };
  },
});

interface ValidateResult {
  valid: boolean;
  error: string;
}

function validateFunction(source: string, target: string): ValidateResult {
  const script = `
import ast
import sys
import json

source = sys.stdin.read()
target = ${JSON.stringify(target)}

tree = ast.parse(source)

target_fn = None
for node in ast.iter_child_nodes(tree):
    if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name == target:
        target_fn = node
        break

if target_fn is None:
    print(json.dumps({"valid": False, "error": f"Function '{target}' not found"}))
else:
    print(json.dumps({"valid": True, "error": ""}))
`;

  try {
    const output = execFileSync("python3", ["-c", script], {
      encoding: "utf-8",
      input: source,
      timeout: 10_000,
    }).trim();

    return JSON.parse(output) as ValidateResult;
  } catch (err) {
    return { valid: false, error: err instanceof Error ? err.message : String(err) };
  }
}

interface TransformResult {
  success: boolean;
  newSource: string;
  error: string;
}

function replaceFunctionWithCommand(
  source: string,
  target: string,
  className: string,
  style: string,
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
style = ${JSON.stringify(style)}

tree = ast.parse(source)
lines = source.splitlines(True)

# Find the target function
target_fn = None
for node in ast.iter_child_nodes(tree):
    if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name == target:
        target_fn = node
        break

if target_fn is None:
    print(json.dumps({"success": False, "error": f"Function '{target}' not found", "newSource": ""}))
    sys.exit(0)

# Extract function parameters (skip closure variables — those are free names in the body)
fn_args = target_fn.args
params = []
for arg in fn_args.args:
    annotation = ""
    if arg.annotation:
        ann_text = ast.get_source_segment(source, arg.annotation)
        if ann_text:
            annotation = f": {ann_text}"
    params.append({"name": arg.arg, "annotation": annotation})

# Handle defaults
num_defaults = len(fn_args.defaults)
num_params = len(params)
for i, default in enumerate(fn_args.defaults):
    param_idx = num_params - num_defaults + i
    if 0 <= param_idx < num_params:
        default_text = ast.get_source_segment(source, default)
        if default_text:
            params[param_idx]["default"] = default_text

param_names = [p["name"] for p in params]

# Get return type
return_type = ""
if target_fn.returns:
    ret_text = ast.get_source_segment(source, target_fn.returns)
    if ret_text:
        return_type = ret_text

# Detect closure variables: names read in the body that are not params and not builtins
# These are module-level variables referenced by the function
class NameCollector(ast.NodeVisitor):
    def __init__(self):
        self.reads = set()
        self.writes = set()
    def visit_Name(self, node):
        if isinstance(node.ctx, ast.Load):
            self.reads.add(node.id)
        elif isinstance(node.ctx, (ast.Store, ast.Del)):
            self.writes.add(node.id)
        self.generic_visit(node)

collector = NameCollector()
collector.visit(target_fn)

import builtins
builtin_names = set(dir(builtins))
# Names that are free variables (not params, not builtins, not locally assigned)
free_vars = sorted((collector.reads - set(param_names) - builtin_names - collector.writes) - {"self"})

# Filter free_vars to only module-level names that actually exist
module_names = set()
for node in ast.iter_child_nodes(tree):
    if isinstance(node, ast.Assign):
        for t in node.targets:
            if isinstance(t, ast.Name):
                module_names.add(t.id)
    elif isinstance(node, ast.FunctionDef):
        module_names.add(node.name)
    elif isinstance(node, ast.ClassDef):
        module_names.add(node.name)
    elif isinstance(node, ast.Import):
        for alias in node.names:
            module_names.add(alias.asname or alias.name)
    elif isinstance(node, ast.ImportFrom):
        for alias in node.names:
            module_names.add(alias.asname or alias.name)

closure_vars = [v for v in free_vars if v in module_names]

# Get function body text
fn_body = target_fn.body
body_start = fn_body[0].lineno - 1
body_end = fn_body[-1].end_lineno
body_lines = lines[body_start:body_end]
body_text = "".join(body_lines)
body_text = textwrap.dedent(body_text)

# Check for docstring
docstring = None
if (fn_body and isinstance(fn_body[0], ast.Expr) and
    isinstance(fn_body[0].value, ast.Constant) and
    isinstance(fn_body[0].value.value, str)):
    docstring_node = fn_body[0]
    ds_start = docstring_node.lineno - 1
    ds_end = docstring_node.end_lineno
    docstring = "".join(lines[ds_start:ds_end])
    docstring = textwrap.dedent(docstring)
    # Remove docstring from body_text — recalculate body without docstring
    if len(fn_body) > 1:
        body_start = fn_body[1].lineno - 1
        body_lines = lines[body_start:body_end]
        body_text = "".join(body_lines)
        body_text = textwrap.dedent(body_text)
    else:
        body_text = "pass\\n"

# Replace param references with self.param in the body
for pname in param_names:
    body_text = re.sub(r'\\b' + re.escape(pname) + r'\\b', f'self.{pname}', body_text)

# Replace closure variable references with self.var in the body
for cvar in closure_vars:
    body_text = re.sub(r'\\b' + re.escape(cvar) + r'\\b', f'self.{cvar}', body_text)

is_async = isinstance(target_fn, ast.AsyncFunctionDef)
async_prefix = "async " if is_async else ""

# Build the class
indent = "    "

if style == "dataclass":
    # Dataclass style
    needs_dataclass_import = True

    # Field declarations
    field_lines = []
    for p in params:
        ann = p.get("annotation", "")
        if not ann:
            ann = ": object"  # dataclass fields need annotations
        line = f"{indent}{p['name']}{ann}"
        if "default" in p:
            line += f" = {p['default']}"
        field_lines.append(line)

    for cvar in closure_vars:
        field_lines.append(f"{indent}{cvar}: object = None")

    # Execute method
    execute_body = textwrap.indent(body_text.rstrip(), indent * 2)
    ret_annotation = f" -> {return_type}" if return_type else ""

    class_lines = []
    class_lines.append(f"@dataclass")
    class_lines.append(f"class {class_name}:")
    class_lines.extend(field_lines)
    class_lines.append("")
    if docstring:
        class_lines.append(f"{indent}{async_prefix}def execute(self){ret_annotation}:")
        class_lines.append(textwrap.indent(docstring.rstrip(), indent * 2))
        class_lines.append(execute_body)
    else:
        class_lines.append(f"{indent}{async_prefix}def execute(self){ret_annotation}:")
        class_lines.append(execute_body)

    class_text = "\\n".join(class_lines)

    # Check if dataclass import already exists
    has_dataclass_import = False
    for node in ast.iter_child_nodes(tree):
        if isinstance(node, ast.ImportFrom) and node.module == "dataclasses":
            for alias in node.names:
                if alias.name == "dataclass":
                    has_dataclass_import = True

else:
    needs_dataclass_import = False
    has_dataclass_import = False

    # Regular class style
    # Field declarations
    field_lines = []
    for p in params:
        ann = p.get("annotation", "")
        field_lines.append(f"{indent}{indent}self.{p['name']}{ann} = {p['name']}")

    for cvar in closure_vars:
        field_lines.append(f"{indent}{indent}self.{cvar} = {cvar}")

    # Constructor params
    ctor_parts = []
    for p in params:
        part = p["name"] + p.get("annotation", "")
        if "default" in p:
            part += f" = {p['default']}"
        ctor_parts.append(part)

    for cvar in closure_vars:
        ctor_parts.append(cvar)

    ctor_param_str = ", ".join(ctor_parts)

    # Execute method
    execute_body = textwrap.indent(body_text.rstrip(), indent * 2)
    ret_annotation = f" -> {return_type}" if return_type else ""

    class_lines = []
    class_lines.append(f"class {class_name}:")
    if docstring:
        class_lines.append(textwrap.indent(docstring.rstrip(), indent))
        class_lines.append("")
    class_lines.append(f"{indent}def __init__(self, {ctor_param_str}):")
    class_lines.extend(field_lines)
    class_lines.append("")
    class_lines.append(f"{indent}{async_prefix}def execute(self){ret_annotation}:")
    class_lines.append(execute_body)

    class_text = "\\n".join(class_lines)

# Find call sites and rewrite them
edits = []

for node in ast.walk(tree):
    if isinstance(node, ast.Call):
        if isinstance(node.func, ast.Name) and node.func.id == target:
            # Direct call: target(args) -> ClassName(args).execute()
            arg_texts = []
            for a in node.args:
                t = ast.get_source_segment(source, a)
                if t:
                    arg_texts.append(t)
            for kw in node.keywords:
                t = ast.get_source_segment(source, kw.value)
                if t and kw.arg:
                    arg_texts.append(f"{kw.arg}={t}")

            # Add closure variables as extra args
            for cvar in closure_vars:
                arg_texts.append(cvar)

            args_str = ", ".join(arg_texts)
            new_call = f"{class_name}({args_str}).execute()"

            edits.append({
                "start_line": node.lineno - 1,
                "start_col": node.col_offset,
                "end_line": node.end_lineno - 1,
                "end_col": node.end_col_offset,
                "replacement": new_call,
            })

# Sort edits bottom-to-top
edits.sort(key=lambda e: (e["start_line"], e["start_col"]), reverse=True)

new_lines = list(lines)

# Apply call-site edits
for edit in edits:
    sl = edit["start_line"]
    sc = edit["start_col"]
    el = edit["end_line"]
    ec = edit["end_col"]
    replacement = edit["replacement"]

    if sl == el:
        line = new_lines[sl]
        new_lines[sl] = line[:sc] + replacement + line[ec:]
    else:
        first_line = new_lines[sl]
        last_line = new_lines[el]
        new_lines[sl] = first_line[:sc] + replacement + last_line[ec:]
        for i in range(el, sl, -1):
            del new_lines[i]

# Replace the function with the class
# Find function start (account for decorators)
fn_start = target_fn.lineno - 1
if target_fn.decorator_list:
    fn_start = target_fn.decorator_list[0].lineno - 1
fn_end = target_fn.end_lineno

# Recalculate position since edits may have shifted lines
# Find the function by searching
new_fn_start = None
for i, line in enumerate(new_lines):
    stripped = line.strip()
    if stripped.startswith(f"def {target}(") or stripped.startswith(f"async def {target}("):
        new_fn_start = i
        break

if new_fn_start is not None:
    # Account for decorators above the def line
    while new_fn_start > 0 and new_lines[new_fn_start - 1].strip().startswith("@"):
        new_fn_start -= 1

    # Find end of function
    fn_indent_len = len(new_lines[new_fn_start]) - len(new_lines[new_fn_start].lstrip())
    new_fn_end = len(new_lines)
    for i in range(new_fn_start + 1, len(new_lines)):
        line = new_lines[i]
        if line.strip() == "":
            continue
        line_indent = len(line) - len(line.lstrip())
        if line_indent <= fn_indent_len:
            new_fn_end = i
            break

    class_lines_final = (class_text + "\\n\\n").splitlines(True)
    new_lines[new_fn_start:new_fn_end] = class_lines_final

# Add dataclass import if needed
if needs_dataclass_import and not has_dataclass_import and style == "dataclass":
    # Insert at the top (after any __future__ imports)
    insert_pos = 0
    for i, line in enumerate(new_lines):
        if line.strip().startswith("from __future__"):
            insert_pos = i + 1
            break

    new_lines.insert(insert_pos, "from dataclasses import dataclass\\n")

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
