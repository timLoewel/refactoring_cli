import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import type { PreconditionResult, RefactoringResult } from "../../core/refactoring.types.js";
import { definePythonRefactoring, pythonParam } from "../../python/python-refactoring-builder.js";
import type { PythonProjectContext } from "../../python/python-refactoring-builder.js";

export const replaceCommandWithFunctionPython = definePythonRefactoring({
  name: "Replace Command With Function (Python)",
  kebabName: "replace-command-with-function-python",
  tier: 2,
  description:
    "Converts a command class with an execute method back into a plain function.",
  params: [
    pythonParam.file(),
    pythonParam.identifier(
      "target",
      "Name of the command class to convert into a function",
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

    const result = validateCommand(source, target);
    if (!result.valid) {
      errors.push(result.error);
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

    const result = replaceCommandWithFunction(source, target);

    if (!result.success) {
      return { success: false, filesChanged: [], description: result.error };
    }

    writeFileSync(filePath, result.newSource, "utf-8");

    const functionName = target.charAt(0).toLowerCase() + target.slice(1);
    return {
      success: true,
      filesChanged: [file],
      description: `Converted command class '${target}' into function '${functionName}'`,
    };
  },
});

interface ValidateResult {
  valid: boolean;
  error: string;
}

function validateCommand(source: string, target: string): ValidateResult {
  const script = `
import ast
import sys
import json

source = sys.stdin.read()
target = ${JSON.stringify(target)}

tree = ast.parse(source)

target_cls = None
for node in ast.iter_child_nodes(tree):
    if isinstance(node, ast.ClassDef) and node.name == target:
        target_cls = node
        break

if target_cls is None:
    print(json.dumps({"valid": False, "error": f"Class '{target}' not found"}))
    sys.exit(0)

has_init = False
has_execute = False
has_call = False
for item in target_cls.body:
    if isinstance(item, (ast.FunctionDef, ast.AsyncFunctionDef)):
        if item.name == "__init__":
            has_init = True
        elif item.name == "execute":
            has_execute = True
        elif item.name == "__call__":
            has_call = True

errors = []
if not has_init:
    errors.append(f"Class '{target}' does not have an __init__ method")
if not has_execute and not has_call:
    errors.append(f"Class '{target}' does not have an 'execute' or '__call__' method")

if errors:
    print(json.dumps({"valid": False, "error": "; ".join(errors)}))
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

function replaceCommandWithFunction(source: string, target: string): TransformResult {
  const script = `
import ast
import sys
import json
import textwrap

source = sys.stdin.read()
target = ${JSON.stringify(target)}

tree = ast.parse(source)
lines = source.splitlines(True)

# Find the target class
target_cls = None
for node in ast.iter_child_nodes(tree):
    if isinstance(node, ast.ClassDef) and node.name == target:
        target_cls = node
        break

if target_cls is None:
    print(json.dumps({"success": False, "error": f"Class '{target}' not found"}))
    sys.exit(0)

# Find __init__ and execute/__call__ methods
init_method = None
execute_method = None
method_name = None
for item in target_cls.body:
    if isinstance(item, (ast.FunctionDef, ast.AsyncFunctionDef)):
        if item.name == "__init__":
            init_method = item
        elif item.name == "execute":
            execute_method = item
            method_name = "execute"
        elif item.name == "__call__":
            if execute_method is None:  # prefer execute over __call__
                execute_method = item
                method_name = "__call__"

if init_method is None:
    print(json.dumps({"success": False, "error": f"Class '{target}' has no __init__ method"}))
    sys.exit(0)

if execute_method is None:
    print(json.dumps({"success": False, "error": f"Class '{target}' has no 'execute' or '__call__' method"}))
    sys.exit(0)

is_callable = method_name == "__call__"

# Extract constructor parameters (skip 'self')
init_args = init_method.args
ctor_params = []
for arg in init_args.args:
    if arg.arg == "self":
        continue
    annotation = ""
    if arg.annotation:
        ann_text = ast.get_source_segment(source, arg.annotation)
        if ann_text:
            annotation = f": {ann_text}"
    ctor_params.append({"name": arg.arg, "text": f"{arg.arg}{annotation}"})

# Handle defaults for constructor params
num_defaults = len(init_args.defaults)
num_params = len(ctor_params)
for i, default in enumerate(init_args.defaults):
    param_idx = num_params - num_defaults + i
    if 0 <= param_idx < num_params:
        default_text = ast.get_source_segment(source, default)
        if default_text:
            ctor_params[param_idx]["text"] += f" = {default_text}"

param_str = ", ".join(p["text"] for p in ctor_params)
param_names = [p["name"] for p in ctor_params]

# Map self.field to constructor param names and collect init-only fields
# Parse __init__ body to find self.field = param assignments
import re
field_to_param = {}
init_only_fields = {}  # field_name -> default_value_text (for fields not from params)
for stmt in init_method.body:
    if isinstance(stmt, ast.Assign):
        for t in stmt.targets:
            if isinstance(t, ast.Attribute) and isinstance(t.value, ast.Name) and t.value.id == "self":
                if isinstance(stmt.value, ast.Name) and stmt.value.id in param_names:
                    field_to_param[t.attr] = stmt.value.id
                else:
                    # Init-only field with a default value
                    val_text = ast.get_source_segment(source, stmt.value)
                    if val_text:
                        init_only_fields[t.attr] = val_text

# Collect __call__ method params (beyond self) if applicable
call_params = []
if is_callable:
    for arg in execute_method.args.args:
        if arg.arg == "self":
            continue
        annotation = ""
        if arg.annotation:
            ann_text = ast.get_source_segment(source, arg.annotation)
            if ann_text:
                annotation = f": {ann_text}"
        call_params.append({"name": arg.arg, "text": f"{arg.arg}{annotation}"})
    # Handle defaults for __call__ params
    call_defaults = execute_method.args.defaults
    num_call_defaults = len(call_defaults)
    num_call_params = len(call_params)
    for i, default in enumerate(call_defaults):
        param_idx = num_call_params - num_call_defaults + i
        if 0 <= param_idx < num_call_params:
            default_text = ast.get_source_segment(source, default)
            if default_text:
                call_params[param_idx]["text"] += f" = {default_text}"

# Combine ctor params + call params for function signature
all_params = list(ctor_params) + list(call_params)
param_str = ", ".join(p["text"] for p in all_params)
all_param_names = param_names + [p["name"] for p in call_params]

# Get execute method body text
execute_body = execute_method.body
body_start = execute_body[0].lineno - 1
body_end = execute_body[-1].end_lineno
body_lines = lines[body_start:body_end]
body_text = "".join(body_lines)

# Dedent the body to base level
body_text = textwrap.dedent(body_text)

# Replace self.field references with parameter names
for field_name, param_name in field_to_param.items():
    body_text = re.sub(r'\\bself\\.' + re.escape(field_name) + r'\\b', param_name, body_text)

# Replace any remaining self.X references (fields assigned directly from params with same name)
for pname in param_names:
    body_text = re.sub(r'\\bself\\.' + re.escape(pname) + r'\\b', pname, body_text)

# Replace self.field for init-only fields with local variable names
for field_name in init_only_fields:
    body_text = re.sub(r'\\bself\\.' + re.escape(field_name) + r'\\b', field_name, body_text)

# Prepend init-only field assignments as local variables
init_lines = ""
for field_name, default_val in init_only_fields.items():
    init_lines += f"{field_name} = {default_val}\\n"

if init_lines:
    body_text = init_lines + body_text

# Get return type from execute method
return_type = ""
if execute_method.returns:
    ret_type_text = ast.get_source_segment(source, execute_method.returns)
    if ret_type_text:
        return_type = f" -> {ret_type_text}"

# Determine async
is_async = isinstance(execute_method, ast.AsyncFunctionDef)
async_prefix = "async " if is_async else ""

# Build function name: lowercase first letter of class name
function_name = target[0].lower() + target[1:]

# Indent the body
indented_body = textwrap.indent(body_text.rstrip(), "    ")

# Build the function
fn_text = f"{async_prefix}def {function_name}({param_str}){return_type}:\\n{indented_body}\\n"

# Get class indentation
cls_line = lines[target_cls.lineno - 1]
cls_indent = ""
for ch in cls_line:
    if ch in (" ", "\\t"):
        cls_indent += ch
    else:
        break

if cls_indent:
    fn_text = textwrap.indent(fn_text, cls_indent)

# Find all call sites and rewrite them
edits = []

def collect_args(call_node):
    """Collect argument texts from a Call node."""
    arg_texts = []
    for a in call_node.args:
        t = ast.get_source_segment(source, a)
        if t:
            arg_texts.append(t)
    for kw in call_node.keywords:
        t = ast.get_source_segment(source, kw.value)
        if t and kw.arg:
            arg_texts.append(f"{kw.arg}={t}")
    return arg_texts

if is_callable:
    # Callable class patterns:
    # Pattern 1: Target(ctor_args)(call_args) — chained call
    for node in ast.walk(tree):
        if isinstance(node, ast.Call):
            inner = node.func
            if (isinstance(inner, ast.Call) and
                isinstance(inner.func, ast.Name) and
                inner.func.id == target):
                ctor_args = collect_args(inner)
                call_args = collect_args(node)
                all_args = ctor_args + call_args
                new_call = f"{function_name}({', '.join(all_args)})"
                edits.append({
                    "start_line": node.lineno - 1,
                    "start_col": node.col_offset,
                    "end_line": node.end_lineno - 1,
                    "end_col": node.end_col_offset,
                    "replacement": new_call,
                })
else:
    # Execute-method patterns:
    # Pattern 1: Target(...).execute() as a chained call
    for node in ast.walk(tree):
        if isinstance(node, ast.Call):
            if (isinstance(node.func, ast.Attribute) and
                node.func.attr == "execute" and
                isinstance(node.func.value, ast.Call) and
                isinstance(node.func.value.func, ast.Name) and
                node.func.value.func.id == target):
                ctor_call = node.func.value
                arg_texts = collect_args(ctor_call)
                new_call = f"{function_name}({', '.join(arg_texts)})"
                edits.append({
                    "start_line": node.lineno - 1,
                    "start_col": node.col_offset,
                    "end_line": node.end_lineno - 1,
                    "end_col": node.end_col_offset,
                    "replacement": new_call,
                })

# Variable-based patterns: cmd = Target(args); cmd.execute() or cmd(call_args)
cmd_vars = {}
for node in ast.walk(tree):
    if isinstance(node, ast.Assign) and len(node.targets) == 1:
        t = node.targets[0]
        if (isinstance(t, ast.Name) and
            isinstance(node.value, ast.Call) and
            isinstance(node.value.func, ast.Name) and
            node.value.func.id == target):
            arg_texts = collect_args(node.value)
            cmd_vars[t.id] = {
                "args": arg_texts,
                "assign_line": node.lineno - 1,
                "assign_end_line": node.end_lineno - 1,
            }

# Find cmd.execute() or cmd(call_args) calls and replace with function_name(args)
for node in ast.walk(tree):
    if isinstance(node, ast.Call):
        if is_callable:
            # cmd(call_args) pattern for callable classes
            if (isinstance(node.func, ast.Name) and
                node.func.id in cmd_vars):
                var_name = node.func.id
                info = cmd_vars[var_name]
                call_args = collect_args(node)
                all_args = info["args"] + call_args
                new_call = f"{function_name}({', '.join(all_args)})"
                edits.append({
                    "start_line": node.lineno - 1,
                    "start_col": node.col_offset,
                    "end_line": node.end_lineno - 1,
                    "end_col": node.end_col_offset,
                    "replacement": new_call,
                })
        else:
            # cmd.execute() pattern
            if (isinstance(node.func, ast.Attribute) and
                node.func.attr == "execute" and
                isinstance(node.func.value, ast.Name) and
                node.func.value.id in cmd_vars):
                var_name = node.func.value.id
                info = cmd_vars[var_name]
                new_call = f"{function_name}({', '.join(info['args'])})"
                edits.append({
                    "start_line": node.lineno - 1,
                    "start_col": node.col_offset,
                    "end_line": node.end_lineno - 1,
                    "end_col": node.end_col_offset,
                    "replacement": new_call,
                })

# Remove the class and replace with the function
cls_start = target_cls.lineno - 1
# Account for decorators
if target_cls.decorator_list:
    cls_start = target_cls.decorator_list[0].lineno - 1
cls_end = target_cls.end_lineno

# Apply edits in reverse order to preserve line numbers
# First: replace class with function
# Then: fix call sites

# Sort call-site edits by line descending (to apply bottom-to-top)
edits.sort(key=lambda e: (e["start_line"], e["start_col"]), reverse=True)

# Apply call-site edits first (they come BEFORE or AFTER the class)
new_lines = list(lines)

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

# Remove cmd = Target(...) assignment lines for cmd_vars
# Sort by line descending
assign_removals = sorted(
    [info["assign_line"] for info in cmd_vars.values()],
    reverse=True
)
for line_idx in assign_removals:
    # Check the line still contains the assignment (edits may have shifted things)
    if line_idx < len(new_lines) and target in new_lines[line_idx]:
        del new_lines[line_idx]

# Now replace the class with the function
# Recalculate cls_start and cls_end in case edits shifted things above the class
# Since we applied call-site edits already, need to find the class lines
# The class start/end were based on original lines, but call-site edits
# BELOW the class shifted nothing, and edits ABOVE shifted the class down.
# Let's just find the class by searching for "class Target" in new_lines.
new_cls_start = None
for i, line in enumerate(new_lines):
    stripped = line.strip()
    if stripped.startswith(f"class {target}") and (":" in stripped or "(" in stripped):
        new_cls_start = i
        break

if new_cls_start is not None:
    # Find end of class: next line at same or lower indentation, or EOF
    cls_indent_len = len(new_lines[new_cls_start]) - len(new_lines[new_cls_start].lstrip())
    new_cls_end = len(new_lines)
    for i in range(new_cls_start + 1, len(new_lines)):
        line = new_lines[i]
        if line.strip() == "":
            continue
        line_indent = len(line) - len(line.lstrip())
        if line_indent <= cls_indent_len:
            new_cls_end = i
            break

    # Replace the class block with the function
    fn_lines = (fn_text + "\\n").splitlines(True)
    new_lines[new_cls_start:new_cls_end] = fn_lines

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
