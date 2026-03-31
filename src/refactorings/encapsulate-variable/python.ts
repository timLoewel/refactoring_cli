import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import type { PreconditionResult, RefactoringResult } from "../../core/refactoring.types.js";
import { definePythonRefactoring, pythonParam } from "../../python/python-refactoring-builder.js";
import type { PythonProjectContext } from "../../python/python-refactoring-builder.js";

export const encapsulateVariablePython = definePythonRefactoring({
  name: "Encapsulate Variable (Python)",
  kebabName: "encapsulate-variable-python",
  tier: 2,
  description:
    "Replaces a module-level variable with getter/setter functions, or a class attribute with @property.",
  params: [
    pythonParam.file(),
    pythonParam.identifier("target", "Name of the variable or attribute to encapsulate"),
    pythonParam.string("className", "Class name (required for class attribute encapsulation)", false),
  ],
  preconditions(ctx: PythonProjectContext, params: Record<string, unknown>): PreconditionResult {
    const errors: string[] = [];
    const file = params["file"] as string;
    const target = params["target"] as string;
    const className = params["className"] as string | undefined;

    const filePath = path.resolve(ctx.projectRoot, file);
    let source: string;
    try {
      source = readFileSync(filePath, "utf-8");
    } catch {
      errors.push(`File not found: ${file}`);
      return { ok: false, errors };
    }

    const result = validateTarget(source, target, className);
    if (!result.valid) {
      errors.push(result.error);
    }

    return { ok: errors.length === 0, errors };
  },
  apply(ctx: PythonProjectContext, params: Record<string, unknown>): RefactoringResult {
    const file = params["file"] as string;
    const target = params["target"] as string;
    const className = params["className"] as string | undefined;

    const filePath = path.resolve(ctx.projectRoot, file);

    let source: string;
    try {
      source = readFileSync(filePath, "utf-8");
    } catch {
      return { success: false, filesChanged: [], description: `File not found: ${file}` };
    }

    const result = className
      ? encapsulateClassAttribute(source, target, className)
      : encapsulateModuleVariable(source, target);

    if (!result.success) {
      return { success: false, filesChanged: [], description: result.error };
    }

    writeFileSync(filePath, result.newSource, "utf-8");

    const filesChanged = [file];

    // Handle cross-file updates for module-level variables
    if (!className) {
      const crossFileResult = updateCrossFileReferences(ctx.projectRoot, file, target);
      filesChanged.push(...crossFileResult);
    }

    return {
      success: true,
      filesChanged,
      description: className
        ? `Encapsulated attribute '${target}' in class '${className}' with @property`
        : `Encapsulated module variable '${target}' with getter/setter functions`,
    };
  },
});

interface ValidateResult {
  valid: boolean;
  error: string;
}

function validateTarget(source: string, target: string, className: string | undefined): ValidateResult {
  const script = `
import ast
import sys
import json

source = sys.stdin.read()
target = ${JSON.stringify(target)}
class_name = ${JSON.stringify(className ?? "")}

tree = ast.parse(source)

if class_name:
    # Look for class attribute
    target_cls = None
    for node in ast.iter_child_nodes(tree):
        if isinstance(node, ast.ClassDef) and node.name == class_name:
            target_cls = node
            break
    if target_cls is None:
        print(json.dumps({"valid": False, "error": f"Class '{class_name}' not found"}))
        sys.exit(0)
    # Check if attribute is used in the class
    found = False
    for node in ast.walk(target_cls):
        if isinstance(node, ast.Attribute) and node.attr == target:
            found = True
            break
    if not found:
        # Check __slots__
        for stmt in target_cls.body:
            if isinstance(stmt, ast.Assign):
                for t in stmt.targets:
                    if isinstance(t, ast.Name) and t.id == "__slots__":
                        if isinstance(stmt.value, ast.Tuple):
                            for elt in stmt.value.elts:
                                if isinstance(elt, ast.Constant) and elt.value == target:
                                    found = True
    if not found:
        print(json.dumps({"valid": False, "error": f"Attribute '{target}' not found in class '{class_name}'"}))
    else:
        print(json.dumps({"valid": True, "error": ""}))
else:
    # Look for module-level variable
    found = False
    for node in ast.iter_child_nodes(tree):
        if isinstance(node, ast.Assign):
            for t in node.targets:
                if isinstance(t, ast.Name) and t.id == target:
                    found = True
        elif isinstance(node, ast.AnnAssign):
            if isinstance(node.target, ast.Name) and node.target.id == target:
                found = True
    if not found:
        print(json.dumps({"valid": False, "error": f"Module-level variable '{target}' not found"}))
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

function encapsulateModuleVariable(source: string, target: string): TransformResult {
  const script = `
import ast
import sys
import json

source = sys.stdin.read()
target = ${JSON.stringify(target)}

tree = ast.parse(source)
lines = source.splitlines(True)

# Find the module-level variable assignment
var_node = None
var_type = None
var_value = None
var_start = None
var_end = None

for node in ast.iter_child_nodes(tree):
    if isinstance(node, ast.Assign):
        for t in node.targets:
            if isinstance(t, ast.Name) and t.id == target:
                var_node = node
                var_start = node.lineno - 1
                var_end = node.end_lineno
                var_value = ast.get_source_segment(source, node.value)
                break
    elif isinstance(node, ast.AnnAssign):
        if isinstance(node.target, ast.Name) and node.target.id == target:
            var_node = node
            var_start = node.lineno - 1
            var_end = node.end_lineno
            ann = ast.get_source_segment(source, node.annotation)
            var_type = ann
            if node.value:
                var_value = ast.get_source_segment(source, node.value)
            break

if var_node is None:
    print(json.dumps({"success": False, "error": f"Variable '{target}' not found", "newSource": ""}))
    sys.exit(0)

if var_value is None:
    var_value = "None"

# Build getter/setter
cap = target[0].upper() + target[1:]
private_name = f"_{target}"

if var_type:
    decl = f"{private_name}: {var_type} = {var_value}"
    getter_ret = f" -> {var_type}"
    setter_param = f"value: {var_type}"
else:
    decl = f"{private_name} = {var_value}"
    getter_ret = ""
    setter_param = "value"

getter = f"def get_{target}(){getter_ret}:\\n    return {private_name}\\n"
setter = f"def set_{target}({setter_param}):\\n    global {private_name}\\n    {private_name} = value\\n"

replacement = f"{decl}\\n\\n\\n{getter}\\n\\n{setter}\\n"

# Replace variable declaration with getter/setter
new_lines = lines[:var_start] + [replacement] + lines[var_end:]

# Now update references in the rest of the file
# Parse the new source to find usages of the old variable name
new_source_tmp = "".join(new_lines)
new_tree = ast.parse(new_source_tmp)
new_lines2 = new_source_tmp.splitlines(True)

edits = []
for node in ast.walk(new_tree):
    if isinstance(node, ast.Name) and node.id == target:
        # Skip the private variable references we just created (inside getter/setter)
        # We need to find references outside of get_/set_ functions
        # Check if this Name node is inside a get_target or set_target function
        pass

# Simpler approach: just do text replacement of bare references
# outside of the getter/setter functions we just created
# Find all Name nodes referring to target in functions that aren't get_/set_
for node in ast.walk(new_tree):
    if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
        if node.name in (f"get_{target}", f"set_{target}"):
            continue
        # Walk this function for references to target
        for child in ast.walk(node):
            if isinstance(child, ast.Name) and child.id == target:
                if isinstance(child.ctx, ast.Load):
                    edits.append({
                        "line": child.lineno - 1,
                        "col": child.col_offset,
                        "end_col": child.end_col_offset,
                        "replacement": f"get_{target}()",
                    })
                elif isinstance(child.ctx, ast.Store):
                    # This would be a reassignment — need set_target()
                    # For now handle simple cases
                    pass

# Also handle module-level code (not inside any function) that references the variable
# These are nodes that are direct children of the module and NOT inside functions
for node in ast.iter_child_nodes(new_tree):
    if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
        continue
    # Walk for references
    for child in ast.walk(node):
        if isinstance(child, ast.Name) and child.id == target:
            if isinstance(child.ctx, ast.Load):
                edits.append({
                    "line": child.lineno - 1,
                    "col": child.col_offset,
                    "end_col": child.end_col_offset,
                    "replacement": f"get_{target}()",
                })

# Sort edits reverse to apply bottom-to-top
edits.sort(key=lambda e: (e["line"], e["col"]), reverse=True)

for edit in edits:
    line = new_lines2[edit["line"]]
    new_lines2[edit["line"]] = line[:edit["col"]] + edit["replacement"] + line[edit["end_col"]:]

new_source = "".join(new_lines2)

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

function encapsulateClassAttribute(source: string, target: string, className: string): TransformResult {
  const script = `
import ast
import sys
import json
import re

source = sys.stdin.read()
target = ${JSON.stringify(target)}
class_name = ${JSON.stringify(className)}

tree = ast.parse(source)
lines = source.splitlines(True)

# Find the class
target_cls = None
for node in ast.iter_child_nodes(tree):
    if isinstance(node, ast.ClassDef) and node.name == class_name:
        target_cls = node
        break

if target_cls is None:
    print(json.dumps({"success": False, "error": f"Class '{class_name}' not found", "newSource": ""}))
    sys.exit(0)

# Determine if name-mangled (__private)
is_mangled = target.startswith("__") and not target.endswith("__")
private_attr = f"_{target}" if not is_mangled else target
storage_attr = f"_{private_attr}" if not is_mangled else f"_{target}"

# For name-mangled attrs, the storage stays as __attr internally, property exposes without __
# Actually for @property encapsulation:
# self.__balance -> self.__balance stays as private storage
# Property name is the public name (without __)
if is_mangled:
    prop_name = target[2:]  # strip leading __
    storage_attr = target  # keep __balance as storage
else:
    prop_name = target
    storage_attr = f"_{target}"

# Find type annotation if any
attr_type = None
for node in ast.walk(target_cls):
    if isinstance(node, ast.AnnAssign):
        if isinstance(node.target, ast.Attribute) and node.target.attr == target:
            attr_type = ast.get_source_segment(source, node.annotation)

# Check for __slots__
has_slots = False
slots_node = None
for stmt in target_cls.body:
    if isinstance(stmt, ast.Assign):
        for t in stmt.targets:
            if isinstance(t, ast.Name) and t.id == "__slots__":
                has_slots = True
                slots_node = stmt

# Determine class body indentation
cls_body_indent = "    "
if target_cls.body:
    first_line = lines[target_cls.body[0].lineno - 1]
    cls_body_indent = ""
    for ch in first_line:
        if ch in (" ", "\\t"):
            cls_body_indent += ch
        else:
            break

inner_indent = cls_body_indent + "    "

# Build @property and @prop.setter
ret_type = f" -> {attr_type}" if attr_type else ""
param_type = f": {attr_type}" if attr_type else ""

property_code = f"""
{cls_body_indent}@property
{cls_body_indent}def {prop_name}(self){ret_type}:
{inner_indent}return self.{storage_attr}

{cls_body_indent}@{prop_name}.setter
{cls_body_indent}def {prop_name}(self, value{param_type}):
{inner_indent}self.{storage_attr} = value
"""

# Now we need to:
# 1. Rename self.target -> self.storage_attr in __init__ and other methods
# 2. Add property/setter at the end of the class
# 3. Update __slots__ if present

edits = []

# Rename attribute accesses inside the class
if not is_mangled:
    # Rename self.target -> self._target in all methods
    for node in ast.walk(target_cls):
        if isinstance(node, ast.Attribute):
            if node.attr == target and isinstance(node.value, ast.Name) and node.value.id == "self":
                # Replace self.target with self._target
                line_idx = node.value.lineno - 1
                line = lines[line_idx] if line_idx < len(lines) else ""
                # Find the attr name position: after "self."
                attr_start = node.value.end_col_offset + 1  # +1 for the dot
                attr_end = node.end_col_offset
                edits.append({
                    "line": line_idx,
                    "col": attr_start,
                    "end_col": attr_end,
                    "replacement": storage_attr,
                })

# For name-mangled attributes, we don't rename inside the class
# because self.__balance is already private — the property just exposes it publicly

# Update __slots__ if present
if has_slots and slots_node and not is_mangled:
    # Add the storage_attr to __slots__ and keep original for property access
    # Actually: replace target with storage_attr in __slots__
    slot_line_start = slots_node.lineno - 1
    slot_line_end = slots_node.end_lineno
    slot_text = "".join(lines[slot_line_start:slot_line_end])
    new_slot_text = slot_text.replace(f'"{target}"', f'"{storage_attr}"').replace(f"'{target}'", f"'{storage_attr}'")
    # Replace the entire slots assignment
    edits.append({
        "type": "replace_lines",
        "start": slot_line_start,
        "end": slot_line_end,
        "replacement": new_slot_text,
    })

# Sort line-based edits and column-based edits separately
col_edits = [e for e in edits if "col" in e]
line_edits = [e for e in edits if "type" in e and e["type"] == "replace_lines"]

# Apply column edits (reverse order)
col_edits.sort(key=lambda e: (e["line"], e["col"]), reverse=True)

new_lines = list(lines)

for edit in col_edits:
    line_idx = edit["line"]
    line = new_lines[line_idx]
    new_lines[line_idx] = line[:edit["col"]] + edit["replacement"] + line[edit["end_col"]:]

# Apply line edits
for edit in line_edits:
    new_lines[edit["start"]:edit["end"]] = [edit["replacement"]]

# Insert property code at the end of the class
cls_end = target_cls.end_lineno
# Find the actual end considering our edits might have shifted things
# Simpler: append property code right after the last line of the class
insert_pos = cls_end  # This is 1-indexed end
new_lines.insert(insert_pos, property_code)

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

function updateCrossFileReferences(projectRoot: string, sourceFile: string, target: string): string[] {
  const script = `
import ast
import sys
import json
import os
import glob

project_root = ${JSON.stringify(projectRoot)}
source_file = ${JSON.stringify(sourceFile)}
target = ${JSON.stringify(target)}

# Get the module name from the source file
source_module = os.path.splitext(source_file)[0].replace(os.sep, ".")

# Find all Python files in the project
py_files = glob.glob(os.path.join(project_root, "**/*.py"), recursive=True)
changed_files = []

for py_file in py_files:
    rel_path = os.path.relpath(py_file, project_root)
    if rel_path == source_file:
        continue

    try:
        content = open(py_file).read()
        tree = ast.parse(content)
    except:
        continue

    # Check if this file imports the target from the source module
    imports_target = False
    import_node = None
    import_alias = target

    for node in ast.iter_child_nodes(tree):
        if isinstance(node, ast.ImportFrom):
            mod = node.module or ""
            # Check various import forms
            source_base = os.path.splitext(source_file)[0]
            if mod == source_base or mod.endswith("." + source_base):
                for alias in node.names:
                    if alias.name == target:
                        imports_target = True
                        import_node = node
                        import_alias = alias.asname or alias.name
                        break

    if not imports_target or import_node is None:
        continue

    lines = content.splitlines(True)

    # Rewrite import: from module import target -> from module import get_target, set_target
    imp_line_start = import_node.lineno - 1
    imp_line_end = import_node.end_lineno
    imp_text = "".join(lines[imp_line_start:imp_line_end])

    # Replace the import
    new_imp = imp_text.replace(target, f"get_{target}, set_{target}")
    lines[imp_line_start:imp_line_end] = [new_imp]

    # Re-parse to find usages
    new_content = "".join(lines)
    try:
        new_tree = ast.parse(new_content)
    except:
        continue

    new_lines = new_content.splitlines(True)
    edits = []

    for node in ast.walk(new_tree):
        if isinstance(node, ast.Name) and node.id == import_alias:
            if isinstance(node.ctx, ast.Load):
                edits.append({
                    "line": node.lineno - 1,
                    "col": node.col_offset,
                    "end_col": node.end_col_offset,
                    "replacement": f"get_{target}()",
                })
            elif isinstance(node.ctx, ast.Store):
                # Assignment: target = value -> set_target(value)
                pass

    edits.sort(key=lambda e: (e["line"], e["col"]), reverse=True)
    for edit in edits:
        line = new_lines[edit["line"]]
        new_lines[edit["line"]] = line[:edit["col"]] + edit["replacement"] + line[edit["end_col"]:]

    final_content = "".join(new_lines)

    if final_content != content:
        open(py_file, "w").write(final_content)
        changed_files.append(rel_path)

print(json.dumps(changed_files))
`;

  try {
    const output = execFileSync("python3", ["-c", script], {
      encoding: "utf-8",
      timeout: 10_000,
    }).trim();

    return JSON.parse(output) as string[];
  } catch {
    return [];
  }
}
