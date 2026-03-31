import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import type { PreconditionResult, RefactoringResult } from "../../core/refactoring.types.js";
import { definePythonRefactoring, pythonParam } from "../../python/python-refactoring-builder.js";
import type { PythonProjectContext } from "../../python/python-refactoring-builder.js";

export const introduceParameterObjectPython = definePythonRefactoring({
  name: "Introduce Parameter Object (Python)",
  kebabName: "introduce-parameter-object-python",
  tier: 2,
  description:
    "Groups a set of parameters into a single parameter object (dataclass or NamedTuple) to reduce argument lists.",
  params: [
    pythonParam.file(),
    pythonParam.identifier("target", "Name of the function to refactor"),
    pythonParam.string("params", "Comma-separated parameter names to group into the object"),
    pythonParam.identifier("objectName", "Name of the new parameter object (e.g. user_data)"),
    pythonParam.identifier("className", "Name of the new class to create (e.g. UserData)"),
    pythonParam.string(
      "style",
      'Class style: "dataclass" (default) or "namedtuple"',
      false,
    ),
  ],
  preconditions(ctx: PythonProjectContext, params: Record<string, unknown>): PreconditionResult {
    const errors: string[] = [];
    const file = params["file"] as string;
    const target = params["target"] as string;
    const paramsStr = params["params"] as string;

    const paramNames = paramsStr
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    if (paramNames.length < 2) {
      errors.push("At least 2 parameter names must be provided");
      return { ok: false, errors };
    }

    const filePath = path.resolve(ctx.projectRoot, file);
    let source: string;
    try {
      source = readFileSync(filePath, "utf-8");
    } catch {
      errors.push(`File not found: ${file}`);
      return { ok: false, errors };
    }

    const result = validateFunction(source, target, paramNames);
    if (!result.valid) {
      errors.push(result.error);
    }

    return { ok: errors.length === 0, errors };
  },
  apply(ctx: PythonProjectContext, params: Record<string, unknown>): RefactoringResult {
    const file = params["file"] as string;
    const target = params["target"] as string;
    const paramsStr = params["params"] as string;
    const objectName = params["objectName"] as string;
    const className = params["className"] as string;
    const style = (params["style"] as string | undefined) ?? "dataclass";

    const paramNames = paramsStr
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    const filePath = path.resolve(ctx.projectRoot, file);

    let source: string;
    try {
      source = readFileSync(filePath, "utf-8");
    } catch {
      return { success: false, filesChanged: [], description: `File not found: ${file}` };
    }

    const result = introduceParameterObject(source, target, paramNames, objectName, className, style);

    if (!result.success) {
      return { success: false, filesChanged: [], description: result.error };
    }

    writeFileSync(filePath, result.newSource, "utf-8");

    const filesChanged = [file];

    return {
      success: true,
      filesChanged,
      description: `Grouped parameters [${paramNames.join(", ")}] of '${target}' into '${className}' object '${objectName}'`,
    };
  },
});

interface ValidateResult {
  valid: boolean;
  error: string;
}

function validateFunction(
  source: string,
  target: string,
  paramNames: string[],
): ValidateResult {
  const script = `
import ast
import sys
import json

source = sys.stdin.read()
target = ${JSON.stringify(target)}
param_names = ${JSON.stringify(paramNames)}

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

all_params = target_func.args.posonlyargs + target_func.args.args
existing_param_names = [p.arg for p in all_params]

missing = [n for n in param_names if n not in existing_param_names]
if missing:
    print(json.dumps({"valid": False, "error": f"Parameters not found in '{target}': {', '.join(missing)}"}))
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

function introduceParameterObject(
  source: string,
  target: string,
  paramNames: string[],
  objectName: string,
  className: string,
  style: string,
): TransformResult {
  const script = `
import ast
import sys
import json
import textwrap

source = sys.stdin.read()
target = ${JSON.stringify(target)}
param_names_to_group = ${JSON.stringify(paramNames)}
object_name = ${JSON.stringify(objectName)}
class_name = ${JSON.stringify(className)}
style = ${JSON.stringify(style)}

tree = ast.parse(source)
lines = source.splitlines(True)

def offset_of(lineno, col_offset):
    return sum(len(lines[i]) for i in range(lineno - 1)) + col_offset

# Find target function
target_func = None
for node in ast.walk(tree):
    if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
        if node.name == target:
            target_func = node
            break

if target_func is None:
    print(json.dumps({"success": False, "error": f"Function '{target}' not found"}))
    sys.exit(0)

all_params = target_func.args.posonlyargs + target_func.args.args

# Collect info about grouped params in their original order
grouped_params = []
for p in all_params:
    if p.arg in param_names_to_group:
        type_text = ast.get_source_segment(source, p.annotation) if p.annotation else None
        grouped_params.append({"name": p.arg, "type": type_text, "node": p})

# Sort by param_names_to_group order
grouped_params.sort(key=lambda x: param_names_to_group.index(x["name"]))

# ---- Build class definition ----
if style == "namedtuple":
    fields_line = ", ".join(f'"{p["name"]}"' for p in grouped_params)
    class_lines = [f"class {class_name}(NamedTuple):\\n"]
    for p in grouped_params:
        type_ann = p["type"] if p["type"] else "object"
        class_lines.append(f"    {p['name']}: {type_ann}\\n")
    class_def = "".join(class_lines) + "\\n\\n"
    import_line = "from typing import NamedTuple\\n"
else:
    class_lines = ["@dataclass\\n", f"class {class_name}:\\n"]
    for p in grouped_params:
        type_ann = p["type"] if p["type"] else "object"
        class_lines.append(f"    {p['name']}: {type_ann}\\n")
    class_def = "".join(class_lines) + "\\n\\n"
    import_line = "from dataclasses import dataclass\\n"

# ---- Collect all text edits ----
# Format: list of (start_offset, end_offset, replacement_text)
edits = []

# ---- 1. Rebuild function signature ----
func_line = lines[target_func.lineno - 1]
open_paren_col = func_line.index("(", target_func.col_offset)
open_paren_offset = sum(len(lines[i]) for i in range(target_func.lineno - 1)) + open_paren_col

paren_depth = 0
close_paren_offset = None
for idx in range(open_paren_offset, len(source)):
    ch = source[idx]
    if ch == "(":
        paren_depth += 1
    elif ch == ")":
        paren_depth -= 1
        if paren_depth == 0:
            close_paren_offset = idx
            break

if close_paren_offset is None:
    print(json.dumps({"success": False, "error": "Could not find closing parenthesis"}))
    sys.exit(0)

# Reconstruct param list: replace grouped params with the new object param
def get_param_text(p):
    text = p.arg
    if p.annotation:
        ann_text = ast.get_source_segment(source, p.annotation)
        text += f": {ann_text}"
    # Check for default value
    all_regular = target_func.args.posonlyargs + target_func.args.args
    regular_idx = all_regular.index(p)
    defaults = target_func.args.defaults
    default_idx = regular_idx - (len(all_regular) - len(defaults))
    if 0 <= default_idx < len(defaults):
        d = defaults[default_idx]
        d_text = ast.get_source_segment(source, d)
        text += f"={d_text}"
    return text

param_parts = []
first_grouped_inserted = False
for p in target_func.args.posonlyargs:
    if p.arg in param_names_to_group:
        if not first_grouped_inserted:
            param_parts.append(f"{object_name}: {class_name}")
            first_grouped_inserted = True
    else:
        param_parts.append(get_param_text(p))

had_posonly = len(target_func.args.posonlyargs) > 0
remaining_posonly = [p for p in target_func.args.posonlyargs if p.arg not in param_names_to_group]
if had_posonly and remaining_posonly:
    param_parts.append("/")

for p in target_func.args.args:
    if p.arg in param_names_to_group:
        if not first_grouped_inserted:
            param_parts.append(f"{object_name}: {class_name}")
            first_grouped_inserted = True
    else:
        param_parts.append(get_param_text(p))

if target_func.args.vararg:
    va = target_func.args.vararg
    text = "*" + va.arg
    if va.annotation:
        text += ": " + ast.get_source_segment(source, va.annotation)
    param_parts.append(text)
elif target_func.args.kwonlyargs:
    param_parts.append("*")

for p in target_func.args.kwonlyargs:
    param_parts.append(get_param_text(p))

if target_func.args.kwarg:
    kw = target_func.args.kwarg
    text = "**" + kw.arg
    if kw.annotation:
        text += ": " + ast.get_source_segment(source, kw.annotation)
    param_parts.append(text)

new_params = ", ".join(param_parts)
edits.append((open_paren_offset + 1, close_paren_offset, new_params))

# ---- 2. Replace usages of grouped param names in function body ----
param_def_positions = set()
for p in all_params:
    param_def_positions.add((p.lineno, p.col_offset))

for node in ast.walk(target_func):
    if isinstance(node, ast.Name) and node.id in param_names_to_group:
        # Skip the parameter definition nodes themselves
        if (node.lineno, node.col_offset) in param_def_positions:
            continue
        start = offset_of(node.lineno, node.col_offset)
        end = offset_of(node.end_lineno, node.end_col_offset)
        edits.append((start, end, f"{object_name}.{node.id}"))

# ---- 3. Update call sites ----
# Build a positional index map: param_names_to_group[i] -> positional index in all_params
param_pos_index = {}
for i, p in enumerate(all_params):
    if p.arg in param_names_to_group:
        param_pos_index[p.arg] = i

for node in ast.walk(tree):
    if not isinstance(node, ast.Call):
        continue
    # Check if this calls the target function
    is_target_call = False
    if isinstance(node.func, ast.Name) and node.func.id == target:
        is_target_call = True
    elif isinstance(node.func, ast.Attribute) and node.func.attr == target:
        is_target_call = True
    if not is_target_call:
        continue

    # Determine which args correspond to grouped params
    # Positional args
    positional_grouped = {}  # param_name -> arg_node (for positional)
    for i, arg in enumerate(node.args):
        # Find which param this positional arg maps to
        param_at_pos = all_params[i] if i < len(all_params) else None
        if param_at_pos and param_at_pos.arg in param_names_to_group:
            positional_grouped[param_at_pos.arg] = arg

    # Keyword args
    keyword_grouped = {}  # param_name -> keyword_node
    for kw in node.keywords:
        if kw.arg and kw.arg in param_names_to_group:
            keyword_grouped[kw.arg] = kw

    grouped_count = len(positional_grouped) + len(keyword_grouped)
    if grouped_count == 0:
        continue

    # Build the constructor call args for the grouped params
    # Maintain the order from param_names_to_group
    constructor_parts = []
    for pname in param_names_to_group:
        if pname in positional_grouped:
            arg_node = positional_grouped[pname]
            constructor_parts.append(ast.get_source_segment(source, arg_node))
        elif pname in keyword_grouped:
            kw_node = keyword_grouped[pname]
            val_text = ast.get_source_segment(source, kw_node.value)
            constructor_parts.append(f"{pname}={val_text}")

    constructor_call = f"{class_name}({', '.join(constructor_parts)})"

    # Now we need to replace the grouped args in the call site.
    # Strategy: replace positional grouped args and grouped keyword args,
    # keeping non-grouped args unchanged.
    # The easiest approach: rewrite the entire argument list.

    # Collect all non-grouped args
    non_grouped_pos = []
    for i, arg in enumerate(node.args):
        param_at_pos = all_params[i] if i < len(all_params) else None
        if not (param_at_pos and param_at_pos.arg in param_names_to_group):
            non_grouped_pos.append(ast.get_source_segment(source, arg))

    non_grouped_kw = []
    for kw in node.keywords:
        if kw.arg not in param_names_to_group if kw.arg else True:
            if kw.arg is None:
                # **kwargs unpacking
                non_grouped_kw.append(f"**{ast.get_source_segment(source, kw.value)}")
            else:
                val_text = ast.get_source_segment(source, kw.value)
                non_grouped_kw.append(f"{kw.arg}={val_text}")

    # Determine insertion point for constructor call
    # Insert constructor call at the position of the first grouped arg
    # (either positional or keyword)
    # Find the minimum position grouped arg
    first_grouped_start = None
    last_grouped_end = None

    for pname in param_names_to_group:
        if pname in positional_grouped:
            arg_node = positional_grouped[pname]
            s = offset_of(arg_node.lineno, arg_node.col_offset)
            e = offset_of(arg_node.end_lineno, arg_node.end_col_offset)
            if first_grouped_start is None or s < first_grouped_start:
                first_grouped_start = s
            if last_grouped_end is None or e > last_grouped_end:
                last_grouped_end = e
        if pname in keyword_grouped:
            kw_node = keyword_grouped[pname]
            # Keyword node: we need its full span including "name="
            # The keyword arg starts at the "name" part, not just the value
            # Use value node start and search backward for the keyword name
            val_node = kw_node.value
            val_start = offset_of(val_node.lineno, val_node.col_offset)
            kw_start = val_start - len(kw_node.arg) - 1  # -1 for "="
            e = offset_of(val_node.end_lineno, val_node.end_col_offset)
            if first_grouped_start is None or kw_start < first_grouped_start:
                first_grouped_start = kw_start
            if last_grouped_end is None or e > last_grouped_end:
                last_grouped_end = e

    if first_grouped_start is None:
        continue

    # Rebuild entire arg list for the call
    # Find call's open/close paren
    call_func_end = offset_of(node.func.end_lineno, node.func.end_col_offset)
    call_open_paren = None
    for idx in range(call_func_end, len(source)):
        if source[idx] == "(":
            call_open_paren = idx
            break

    if call_open_paren is None:
        continue

    paren_depth = 0
    call_close_paren = None
    for idx in range(call_open_paren, len(source)):
        ch = source[idx]
        if ch == "(":
            paren_depth += 1
        elif ch == ")":
            paren_depth -= 1
            if paren_depth == 0:
                call_close_paren = idx
                break

    if call_close_paren is None:
        continue

    # Build new arg list: non-grouped positional + constructor call + non-grouped keyword
    new_args = non_grouped_pos + [constructor_call] + non_grouped_kw
    new_call_args = ", ".join(new_args)
    edits.append((call_open_paren + 1, call_close_paren, new_call_args))

# Sort edits in reverse order to avoid offset shifting
edits.sort(key=lambda e: (e[0], e[1]), reverse=True)

new_source = source
for start, end, replacement in edits:
    new_source = new_source[:start] + replacement + new_source[end:]

# ---- 4. Insert class definition before the function ----
# Find the insertion line (before the function definition, accounting for decorators)
insert_line = target_func.decorator_list[0].lineno if target_func.decorator_list else target_func.lineno
# Convert to 0-indexed
insert_idx = insert_line - 1

new_lines = new_source.splitlines(True)
new_lines.insert(insert_idx, class_def)
new_source = "".join(new_lines)

# ---- 5. Add import at the top ----
# Check if import already present
if import_line.strip() not in new_source:
    # Find the right spot: after existing imports or at the very top
    import_tree = ast.parse(new_source)
    last_import_line = 0
    for node in import_tree.body:
        if isinstance(node, (ast.Import, ast.ImportFrom)):
            last_import_line = node.end_lineno
    import_lines = new_source.splitlines(True)
    import_lines.insert(last_import_line, import_line)
    new_source = "".join(import_lines)

print(json.dumps({
    "success": True,
    "newSource": new_source,
}))
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
