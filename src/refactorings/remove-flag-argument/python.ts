import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import type { PreconditionResult, RefactoringResult } from "../../core/refactoring.types.js";
import { definePythonRefactoring, pythonParam } from "../../python/python-refactoring-builder.js";
import type { PythonProjectContext } from "../../python/python-refactoring-builder.js";

export const removeFlagArgumentPython = definePythonRefactoring({
  name: "Remove Flag Argument (Python)",
  kebabName: "remove-flag-argument-python",
  tier: 2,
  description:
    "Splits a function that accepts a boolean flag into two specialized functions.",
  params: [
    pythonParam.file(),
    pythonParam.identifier("target", "Name of the function with the flag argument"),
    pythonParam.identifier("flag", "Name of the boolean flag parameter to remove"),
  ],
  preconditions(ctx: PythonProjectContext, params: Record<string, unknown>): PreconditionResult {
    const errors: string[] = [];
    const file = params["file"] as string;
    const target = params["target"] as string;
    const flag = params["flag"] as string;

    const filePath = path.resolve(ctx.projectRoot, file);
    let source: string;
    try {
      source = readFileSync(filePath, "utf-8");
    } catch {
      errors.push(`File not found: ${file}`);
      return { ok: false, errors };
    }

    const result = validateFlagArg(source, target, flag);
    if (!result.valid) {
      errors.push(result.error);
    }

    return { ok: errors.length === 0, errors };
  },
  apply(ctx: PythonProjectContext, params: Record<string, unknown>): RefactoringResult {
    const file = params["file"] as string;
    const target = params["target"] as string;
    const flag = params["flag"] as string;

    const filePath = path.resolve(ctx.projectRoot, file);

    let source: string;
    try {
      source = readFileSync(filePath, "utf-8");
    } catch {
      return { success: false, filesChanged: [], description: `File not found: ${file}` };
    }

    const result = removeFlagArgument(source, target, flag);

    if (!result.success) {
      return { success: false, filesChanged: [], description: result.error };
    }

    writeFileSync(filePath, result.newSource, "utf-8");

    return {
      success: true,
      filesChanged: [file],
      description: `Split '${target}' on flag '${flag}' into '${target}_when_true' and '${target}_when_false'`,
    };
  },
});

interface ValidateResult {
  valid: boolean;
  error: string;
}

function validateFlagArg(source: string, target: string, flag: string): ValidateResult {
  const script = `
import ast
import sys
import json

source = sys.stdin.read()
target = ${JSON.stringify(target)}
flag = ${JSON.stringify(flag)}

tree = ast.parse(source)

target_func = None
for node in ast.walk(tree):
    if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
        if node.name == target:
            target_func = node
            break

if target_func is None:
    print(json.dumps({"valid": False, "error": f"Function '{target}' not found"}))
    sys.exit(0)

# Check that the flag parameter exists
args = target_func.args
all_params = args.posonlyargs + args.args + args.kwonlyargs
param_names = [a.arg for a in all_params]

if flag not in param_names:
    print(json.dumps({"valid": False, "error": f"Parameter '{flag}' not found in function '{target}'"}))
    sys.exit(0)

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

function removeFlagArgument(source: string, target: string, flag: string): TransformResult {
  const script = `
import ast
import sys
import json

source = sys.stdin.read()
target = ${JSON.stringify(target)}
flag = ${JSON.stringify(flag)}

tree = ast.parse(source)
lines = source.splitlines(True)

# Find the target function and determine if it's a method
target_func = None
parent_class = None
for node in ast.walk(tree):
    if isinstance(node, ast.ClassDef):
        for item in node.body:
            if isinstance(item, (ast.FunctionDef, ast.AsyncFunctionDef)) and item.name == target:
                target_func = item
                parent_class = node
                break
    if target_func:
        break

if target_func is None:
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name == target:
            target_func = node
            break

if target_func is None:
    print(json.dumps({"success": False, "newSource": "", "error": f"Function '{target}' not found"}))
    sys.exit(0)

is_method = parent_class is not None
is_async = isinstance(target_func, ast.AsyncFunctionDef)
async_prefix = "async " if is_async else ""

# Get function indentation
func_line = lines[target_func.lineno - 1]
func_indent = ""
for ch in func_line:
    if ch in (" ", "\\t"):
        func_indent += ch
    else:
        break

# Get body indentation
body = target_func.body
first_body_line = lines[body[0].lineno - 1]
body_indent = ""
for ch in first_body_line:
    if ch in (" ", "\\t"):
        body_indent += ch
    else:
        break

# Collect all parameters and find the flag
args = target_func.args
all_arg_nodes = args.posonlyargs + args.args + args.kwonlyargs
flag_index = None
param_texts_without_flag = []
param_names_without_flag = []

# Count position of flag across all parameter kinds
flat_index = 0
# Track if flag is keyword-only
flag_is_kwonly = False
for arg in args.posonlyargs + args.args:
    if arg.arg == flag:
        flag_index = flat_index
        break
    flat_index += 1

if flag_index is None:
    for arg in args.kwonlyargs:
        if arg.arg == flag:
            flag_index = flat_index
            flag_is_kwonly = True
            break
        flat_index += 1

if flag_index is None:
    print(json.dumps({"success": False, "newSource": "", "error": f"Parameter '{flag}' not found"}))
    sys.exit(0)

# Build parameter list without the flag
for i, arg in enumerate(all_arg_nodes):
    if arg.arg == flag:
        continue
    text = arg.arg
    if arg.annotation:
        ann = ast.get_source_segment(source, arg.annotation)
        if ann:
            text += f": {ann}"
    param_texts_without_flag.append(text)
    param_names_without_flag.append(arg.arg)

# Handle *args and **kwargs
vararg_text = ""
if args.vararg:
    text = f"*{args.vararg.arg}"
    if args.vararg.annotation:
        ann = ast.get_source_segment(source, args.vararg.annotation)
        if ann:
            text += f": {ann}"
    vararg_text = text

kwarg_text = ""
if args.kwarg:
    text = f"**{args.kwarg.arg}"
    if args.kwarg.annotation:
        ann = ast.get_source_segment(source, args.kwarg.annotation)
        if ann:
            text += f": {ann}"
    kwarg_text = text

# Build the full parameter string (excluding flag)
full_params = []
posonly = [a for a in args.posonlyargs if a.arg != flag]
regular = [a for a in args.args if a.arg != flag]
kwonly = [a for a in args.kwonlyargs if a.arg != flag]

for arg in posonly:
    text = arg.arg
    if arg.annotation:
        ann = ast.get_source_segment(source, arg.annotation)
        if ann:
            text += f": {ann}"
    full_params.append(text)

if posonly and args.posonlyargs:
    full_params.append("/")

for arg in regular:
    text = arg.arg
    if arg.annotation:
        ann = ast.get_source_segment(source, arg.annotation)
        if ann:
            text += f": {ann}"
    full_params.append(text)

if vararg_text:
    full_params.append(vararg_text)

if kwonly:
    if not vararg_text:
        full_params.append("*")
    for arg in kwonly:
        text = arg.arg
        if arg.annotation:
            ann = ast.get_source_segment(source, arg.annotation)
            if ann:
                text += f": {ann}"
        full_params.append(text)

if kwarg_text:
    full_params.append(kwarg_text)

param_str = ", ".join(full_params)

# Get return type annotation
return_type = ""
if target_func.returns:
    ret_text = ast.get_source_segment(source, target_func.returns)
    if ret_text:
        return_type = f" -> {ret_text}"

# Get decorators text
decorators = ""
for dec in target_func.decorator_list:
    dec_line_start = dec.lineno - 1
    dec_line_end = dec.end_lineno
    dec_text = "".join(lines[dec_line_start:dec_line_end]).rstrip("\\n")
    # Ensure decorator starts with @
    stripped = dec_text.lstrip()
    if not stripped.startswith("@"):
        dec_text = func_indent + "@" + stripped
    decorators += dec_text + "\\n"

# Get the body text of the original function
body_start = body[0].lineno - 1
body_end = body[-1].end_lineno
body_text = "".join(lines[body_start:body_end])

# Replace flag references with True/False in the body
# Find all Name nodes referencing the flag parameter in the body
def replace_flag_in_body(body_source, flag_name, replacement):
    """Replace all references to flag_name with replacement (True/False) in body source."""
    try:
        # Parse the body as a module to find Name references
        # We need to dedent first
        import textwrap
        dedented = textwrap.dedent(body_source)
        body_tree = ast.parse(dedented)
        body_lines = dedented.splitlines(True)

        # Collect all Name references to the flag
        flag_refs = []
        for node in ast.walk(body_tree):
            if isinstance(node, ast.Name) and node.id == flag_name:
                flag_refs.append(node)

        # Sort in reverse order for safe replacement
        flag_refs.sort(key=lambda n: (n.lineno, n.col_offset), reverse=True)

        for ref in flag_refs:
            line_idx = ref.lineno - 1
            col = ref.col_offset
            end_col = ref.end_col_offset
            line = body_lines[line_idx]
            body_lines[line_idx] = line[:col] + replacement + line[end_col:]

        # Re-indent to original level
        result = "".join(body_lines)
        # Find the original indentation
        for ch in body_source.splitlines(True)[0]:
            if ch not in (" ", "\\t"):
                break
        orig_indent = ""
        for ch in body_source.splitlines(True)[0]:
            if ch in (" ", "\\t"):
                orig_indent += ch
            else:
                break
        re_indented = ""
        for line in result.splitlines(True):
            if line.strip():
                re_indented += orig_indent + line
            else:
                re_indented += line
        return re_indented
    except:
        # Fallback: simple text replacement
        return body_source.replace(flag_name, replacement)

true_body = replace_flag_in_body(body_text, flag, "True")
false_body = replace_flag_in_body(body_text, flag, "False")

# Build two new function names using Python snake_case convention
true_name = f"{target}_when_true"
false_name = f"{target}_when_false"

# Build two specialized functions
true_fn = f"{decorators}{func_indent}{async_prefix}def {true_name}({param_str}){return_type}:\\n{true_body}"
false_fn = f"{decorators}{func_indent}{async_prefix}def {false_name}({param_str}){return_type}:\\n{false_body}"

# Now update call sites — find all calls to the target function
edits = []

for node in ast.walk(tree):
    if not isinstance(node, ast.Call):
        continue

    # Check if this is a call to the target function
    func_node = node.func
    called_name = None
    if isinstance(func_node, ast.Name) and func_node.id == target:
        called_name = target
    elif isinstance(func_node, ast.Attribute) and func_node.attr == target:
        called_name = target

    if called_name is None:
        continue

    # Find the flag argument value
    flag_value = None
    flag_arg_node = None

    # Check positional arguments
    if not flag_is_kwonly and flag_index is not None and flag_index < len(node.args):
        flag_arg_node = node.args[flag_index]
        flag_value = ast.get_source_segment(source, flag_arg_node)

    # Check keyword arguments
    for kw in node.keywords:
        if kw.arg == flag:
            flag_arg_node = kw
            flag_value = ast.get_source_segment(source, kw.value)
            break

    if flag_value is None:
        # Flag not provided — check for default value
        # Find the default value for this parameter
        flag_default = None
        if flag_is_kwonly:
            kw_idx = [a.arg for a in args.kwonlyargs].index(flag)
            defaults = args.kw_defaults
            if kw_idx < len(defaults) and defaults[kw_idx] is not None:
                flag_default = ast.get_source_segment(source, defaults[kw_idx])
        else:
            # For regular args, defaults are right-aligned
            num_args = len(args.posonlyargs) + len(args.args)
            num_defaults = len(args.defaults)
            default_offset = num_args - num_defaults
            if flag_index is not None and flag_index >= default_offset:
                def_idx = flag_index - default_offset
                if def_idx < len(args.defaults):
                    flag_default = ast.get_source_segment(source, args.defaults[def_idx])

        if flag_default is not None:
            flag_value = flag_default
        else:
            # No default, no argument provided — use True as fallback
            flag_value = "True"

    # Determine which specialized function to call
    is_true = flag_value.strip() in ("True", "true", "1")
    new_name = true_name if is_true else false_name

    # Build new argument list (remove the flag argument)
    new_args = []
    for i, arg_node in enumerate(node.args):
        if not flag_is_kwonly and i == flag_index:
            continue
        new_args.append(ast.get_source_segment(source, arg_node))

    new_kwargs = []
    for kw in node.keywords:
        if kw.arg == flag:
            continue
        if kw.arg is None:
            # **kwargs unpacking
            new_kwargs.append(f"**{ast.get_source_segment(source, kw.value)}")
        else:
            new_kwargs.append(f"{kw.arg}={ast.get_source_segment(source, kw.value)}")

    all_args = [a for a in new_args if a] + new_kwargs

    # Reconstruct the call expression
    if isinstance(func_node, ast.Attribute):
        obj_text = ast.get_source_segment(source, func_node.value)
        new_call = f"{obj_text}.{new_name}({', '.join(all_args)})"
    else:
        new_call = f"{new_name}({', '.join(all_args)})"

    # Record the edit
    call_start_line = node.lineno - 1
    call_end_line = node.end_lineno
    call_start_col = node.col_offset
    call_end_col = node.end_col_offset

    edits.append({
        "start_line": call_start_line,
        "start_col": call_start_col,
        "end_line": call_end_line - 1,
        "end_col": call_end_col,
        "new_text": new_call,
    })

# Apply edits in reverse order to preserve positions
edits.sort(key=lambda e: (e["start_line"], e["start_col"]), reverse=True)

for edit in edits:
    if edit["start_line"] == edit["end_line"]:
        line = lines[edit["start_line"]]
        lines[edit["start_line"]] = line[:edit["start_col"]] + edit["new_text"] + line[edit["end_col"]:]
    else:
        # Multi-line call
        first_line = lines[edit["start_line"]]
        last_line = lines[edit["end_line"]]
        lines[edit["start_line"]] = first_line[:edit["start_col"]] + edit["new_text"] + last_line[edit["end_col"]:]
        del lines[edit["start_line"] + 1:edit["end_line"] + 1]

# Now replace the original function with the two specialized functions
# Re-parse to find the function position after call-site edits
new_source_after_calls = "".join(lines)
new_tree = ast.parse(new_source_after_calls)
new_lines = new_source_after_calls.splitlines(True)

# Find the target function again
new_func = None
for node in ast.walk(new_tree):
    if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name == target:
        new_func = node
        break

if new_func is None:
    print(json.dumps({"success": False, "newSource": "", "error": "Lost function after call-site edits"}))
    sys.exit(0)

# Determine the function range (including decorators)
func_start = new_func.lineno - 1
if new_func.decorator_list:
    func_start = new_func.decorator_list[0].lineno - 1
func_end = new_func.end_lineno

# Replace the function with two specialized versions
replacement = true_fn + "\\n" + false_fn
result_lines = new_lines[:func_start] + [replacement] + new_lines[func_end:]

final_source = "".join(result_lines)

print(json.dumps({"success": True, "newSource": final_source}))
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
