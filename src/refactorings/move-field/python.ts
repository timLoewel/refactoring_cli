import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import type { PreconditionResult, RefactoringResult } from "../../core/refactoring.types.js";
import { definePythonRefactoring, pythonParam } from "../../python/python-refactoring-builder.js";
import type { PythonProjectContext } from "../../python/python-refactoring-builder.js";

export const moveFieldPython = definePythonRefactoring({
  name: "Move Field (Python)",
  kebabName: "move-field-python",
  tier: 3,
  description:
    "Moves a field from one class to another and updates references to go through the link attribute.",
  params: [
    pythonParam.file(),
    pythonParam.identifier("target", "Name of the source class"),
    pythonParam.identifier("field", "Name of the field to move"),
    pythonParam.identifier("destination", "Name of the destination class"),
    pythonParam.identifier("via", "Attribute on source class that references the destination class"),
  ],
  preconditions(ctx: PythonProjectContext, params: Record<string, unknown>): PreconditionResult {
    const errors: string[] = [];
    const file = params["file"] as string;
    const target = params["target"] as string;
    const field = params["field"] as string;
    const destination = params["destination"] as string;
    const via = params["via"] as string;

    const filePath = path.resolve(ctx.projectRoot, file);
    let source: string;
    try {
      source = readFileSync(filePath, "utf-8");
    } catch {
      errors.push(`File not found: ${file}`);
      return { ok: false, errors };
    }

    const result = validateMoveField(source, target, field, destination, via);
    if (!result.valid) {
      errors.push(...result.errors);
    }

    return { ok: errors.length === 0, errors };
  },
  apply(ctx: PythonProjectContext, params: Record<string, unknown>): RefactoringResult {
    const file = params["file"] as string;
    const target = params["target"] as string;
    const field = params["field"] as string;
    const destination = params["destination"] as string;
    const via = params["via"] as string;

    const filePath = path.resolve(ctx.projectRoot, file);

    let source: string;
    try {
      source = readFileSync(filePath, "utf-8");
    } catch {
      return { success: false, filesChanged: [], description: `File not found: ${file}` };
    }

    const result = applyMoveField(source, target, field, destination, via);

    if (!result.success) {
      return { success: false, filesChanged: [], description: result.error };
    }

    writeFileSync(filePath, result.newSource, "utf-8");

    return {
      success: true,
      filesChanged: [file],
      description: `Moved field '${field}' from class '${target}' to class '${destination}' (via '${via}')`,
    };
  },
});

interface ValidateResult {
  valid: boolean;
  errors: string[];
}

function validateMoveField(
  source: string,
  target: string,
  field: string,
  destination: string,
  via: string,
): ValidateResult {
  const script = `
import ast
import sys
import json

source = sys.stdin.read()
target = ${JSON.stringify(target)}
field = ${JSON.stringify(field)}
destination = ${JSON.stringify(destination)}
via = ${JSON.stringify(via)}

tree = ast.parse(source)
errors = []

# Find classes
classes = {}
for node in ast.iter_child_nodes(tree):
    if isinstance(node, ast.ClassDef):
        classes[node.name] = node

if target not in classes:
    errors.append(f"Source class '{target}' not found")
if destination not in classes:
    errors.append(f"Destination class '{destination}' not found")
if target == destination:
    errors.append("Source and destination must be different classes")

if not errors:
    src_cls = classes[target]
    dst_cls = classes[destination]

    # Check field exists on source class
    has_field = False
    for node in ast.walk(src_cls):
        if isinstance(node, ast.Attribute) and node.attr == field:
            if isinstance(node.value, ast.Name) and node.value.id == "self":
                has_field = True
                break
    # Also check for property or __slots__
    for stmt in src_cls.body:
        if isinstance(stmt, ast.FunctionDef) and stmt.name == field:
            # Could be a @property
            for dec in stmt.decorator_list:
                if isinstance(dec, ast.Name) and dec.id == "property":
                    has_field = True
        if isinstance(stmt, ast.Assign):
            for t in stmt.targets:
                if isinstance(t, ast.Name) and t.id == "__slots__":
                    if isinstance(stmt.value, (ast.Tuple, ast.List)):
                        for elt in stmt.value.elts:
                            if isinstance(elt, ast.Constant) and elt.value == field:
                                has_field = True

    if not has_field:
        errors.append(f"Field '{field}' not found on class '{target}'")

    # Check destination doesn't already have the field
    has_dst_field = False
    for node in ast.walk(dst_cls):
        if isinstance(node, ast.Attribute) and node.attr == field:
            if isinstance(node.value, ast.Name) and node.value.id == "self":
                has_dst_field = True
                break
    if has_dst_field:
        errors.append(f"Field '{field}' already exists on class '{destination}'")

    # Check via attribute exists on source class
    has_via = False
    for node in ast.walk(src_cls):
        if isinstance(node, ast.Attribute) and node.attr == via:
            if isinstance(node.value, ast.Name) and node.value.id == "self":
                has_via = True
                break
    if not has_via:
        errors.append(f"Link attribute '{via}' not found on class '{target}'")

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

function applyMoveField(
  source: string,
  target: string,
  field: string,
  destination: string,
  via: string,
): TransformResult {
  const script = `
import ast
import sys
import json
import textwrap
import re

source = sys.stdin.read()
target = ${JSON.stringify(target)}
field = ${JSON.stringify(field)}
destination = ${JSON.stringify(destination)}
via = ${JSON.stringify(via)}

tree = ast.parse(source)
lines = source.splitlines(True)

# Find classes
classes = {}
for node in ast.iter_child_nodes(tree):
    if isinstance(node, ast.ClassDef):
        classes[node.name] = node

src_cls = classes[target]
dst_cls = classes[destination]

# Detect field kind: plain attribute, property, dataclass field, slots field
field_kind = "plain"  # plain | property | dataclass | slots
field_type = None
field_default = None
field_assign_line = None
field_assign_end = None
property_lines = None  # (start, end) for property block

# Check for @dataclass decorator
is_src_dataclass = False
for dec in src_cls.decorator_list:
    if isinstance(dec, ast.Name) and dec.id == "dataclass":
        is_src_dataclass = True
    elif isinstance(dec, ast.Call) and isinstance(dec.func, ast.Name) and dec.func.id == "dataclass":
        is_src_dataclass = True

is_dst_dataclass = False
for dec in dst_cls.decorator_list:
    if isinstance(dec, ast.Name) and dec.id == "dataclass":
        is_dst_dataclass = True
    elif isinstance(dec, ast.Call) and isinstance(dec.func, ast.Name) and dec.func.id == "dataclass":
        is_dst_dataclass = True

# Check for __slots__
src_slots_node = None
dst_slots_node = None
for stmt in src_cls.body:
    if isinstance(stmt, ast.Assign):
        for t in stmt.targets:
            if isinstance(t, ast.Name) and t.id == "__slots__":
                src_slots_node = stmt
for stmt in dst_cls.body:
    if isinstance(stmt, ast.Assign):
        for t in stmt.targets:
            if isinstance(t, ast.Name) and t.id == "__slots__":
                dst_slots_node = stmt

# Check for @property
property_getter = None
property_setter = None
property_deleter = None
for stmt in src_cls.body:
    if isinstance(stmt, ast.FunctionDef) and stmt.name == field:
        for dec in stmt.decorator_list:
            if isinstance(dec, ast.Name) and dec.id == "property":
                property_getter = stmt
                field_kind = "property"
            elif isinstance(dec, ast.Attribute) and dec.attr == "setter":
                property_setter = stmt
            elif isinstance(dec, ast.Attribute) and dec.attr == "deleter":
                property_deleter = stmt

# Check for dataclass field
if is_src_dataclass:
    for stmt in src_cls.body:
        if isinstance(stmt, ast.AnnAssign) and isinstance(stmt.target, ast.Name) and stmt.target.id == field:
            field_kind = "dataclass"
            field_type = ast.get_source_segment(source, stmt.annotation)
            if stmt.value:
                field_default = ast.get_source_segment(source, stmt.value)
            field_assign_line = stmt.lineno - 1
            field_assign_end = stmt.end_lineno
            break

# Check for __slots__ field
if src_slots_node is not None:
    if isinstance(src_slots_node.value, (ast.Tuple, ast.List)):
        for elt in src_slots_node.value.elts:
            if isinstance(elt, ast.Constant) and elt.value == field:
                field_kind = "slots"
                break

# For plain fields, find the assignment in __init__
if field_kind == "plain":
    for stmt in src_cls.body:
        if isinstance(stmt, ast.FunctionDef) and stmt.name == "__init__":
            for s in stmt.body:
                if isinstance(s, ast.Assign):
                    for t in s.targets:
                        if isinstance(t, ast.Attribute) and t.attr == field and isinstance(t.value, ast.Name) and t.value.id == "self":
                            field_assign_line = s.lineno - 1
                            field_assign_end = s.end_lineno
                            field_default = ast.get_source_segment(source, s.value)
                            break
                elif isinstance(s, ast.AnnAssign):
                    if isinstance(s.target, ast.Attribute) and s.target.attr == field and isinstance(s.target.value, ast.Name) and s.target.value.id == "self":
                        field_assign_line = s.lineno - 1
                        field_assign_end = s.end_lineno
                        field_type = ast.get_source_segment(source, s.annotation)
                        if s.value:
                            field_default = ast.get_source_segment(source, s.value)
                        break

# Determine destination class body indentation
dst_body_indent = "    "
if dst_cls.body:
    first_line = lines[dst_cls.body[0].lineno - 1]
    dst_body_indent = ""
    for ch in first_line:
        if ch in (" ", "\\t"):
            dst_body_indent += ch
        else:
            break

dst_inner_indent = dst_body_indent + "    "

edits = []  # (line_idx, col_start, col_end, replacement) or ("delete_lines", start, end) or ("insert_after_line", line, text)

# ── Step 1: Remove field from source class ──

if field_kind == "property":
    # Collect all property-related methods and remove them
    prop_methods = [m for m in [property_getter, property_setter, property_deleter] if m is not None]
    prop_methods.sort(key=lambda m: m.lineno)
    # Find the backing field (e.g., self._field) in __init__
    backing_field = f"_{field}"
    backing_assign_line = None
    backing_assign_end = None
    backing_default = None
    for stmt in src_cls.body:
        if isinstance(stmt, ast.FunctionDef) and stmt.name == "__init__":
            for s in stmt.body:
                if isinstance(s, ast.Assign):
                    for t in s.targets:
                        if isinstance(t, ast.Attribute) and t.attr == backing_field and isinstance(t.value, ast.Name) and t.value.id == "self":
                            backing_assign_line = s.lineno - 1
                            backing_assign_end = s.end_lineno
                            backing_default = ast.get_source_segment(source, s.value)
    # Mark property methods for removal
    for m in prop_methods:
        # Include decorators
        start = m.lineno - 1
        if m.decorator_list:
            start = m.decorator_list[0].lineno - 1
        end = m.end_lineno
        edits.append(("delete_lines", start, end))
    # Mark backing field for removal
    if backing_assign_line is not None:
        edits.append(("delete_lines", backing_assign_line, backing_assign_end))

elif field_kind == "dataclass":
    if field_assign_line is not None:
        edits.append(("delete_lines", field_assign_line, field_assign_end))

elif field_kind == "slots":
    # Remove field from __slots__ tuple
    pass  # Handled below in slots update

elif field_kind == "plain":
    if field_assign_line is not None:
        edits.append(("delete_lines", field_assign_line, field_assign_end))

# ── Step 2: Update __slots__ if applicable ──

if field_kind == "slots" and src_slots_node is not None:
    # Remove field from source __slots__
    src_slot_start = src_slots_node.lineno - 1
    src_slot_end = src_slots_node.end_lineno
    src_slot_text = "".join(lines[src_slot_start:src_slot_end])
    # Remove the field entry from the tuple/list
    # Handle both ("a", "b", "field") and ("field",) cases
    new_slot_text = src_slot_text
    q = "[" + chr(34) + chr(39) + "]"
    new_slot_text = re.sub(r",\\s*" + q + re.escape(field) + q, "", new_slot_text)
    new_slot_text = re.sub(q + re.escape(field) + q + r"\\s*,\\s*", "", new_slot_text)
    new_slot_text = re.sub(q + re.escape(field) + q, "", new_slot_text)
    edits.append(("replace_lines", src_slot_start, src_slot_end, new_slot_text))

    # Also remove self.field = ... from __init__
    for stmt in src_cls.body:
        if isinstance(stmt, ast.FunctionDef) and stmt.name == "__init__":
            for s in stmt.body:
                if isinstance(s, ast.Assign):
                    for t in s.targets:
                        if isinstance(t, ast.Attribute) and t.attr == field and isinstance(t.value, ast.Name) and t.value.id == "self":
                            field_default = ast.get_source_segment(source, s.value)
                            edits.append(("delete_lines", s.lineno - 1, s.end_lineno))

    # Add field to destination __slots__
    if dst_slots_node is not None:
        dst_slot_start = dst_slots_node.lineno - 1
        dst_slot_end = dst_slots_node.end_lineno
        dst_slot_text = "".join(lines[dst_slot_start:dst_slot_end])
        # Add field to the tuple
        # Find the closing paren/bracket
        close_idx = dst_slot_text.rfind(")")
        if close_idx == -1:
            close_idx = dst_slot_text.rfind("]")
        if close_idx >= 0:
            before = dst_slot_text[:close_idx].rstrip()
            # Remove trailing comma if present to avoid double comma
            if before.endswith(","):
                before = before[:-1]
            new_dst_slot = before + f', "{field}"' + dst_slot_text[close_idx:]
            edits.append(("replace_lines", dst_slot_start, dst_slot_end, new_dst_slot))

# ── Step 3: Add field to destination class ──

dst_end = dst_cls.end_lineno

if field_kind == "property":
    # Add backing field to __init__ and property code after the class
    init_insert = None
    for stmt in dst_cls.body:
        if isinstance(stmt, ast.FunctionDef) and stmt.name == "__init__":
            init_insert = stmt.body[-1].end_lineno
            break
    if init_insert is not None and backing_default is not None:
        edits.append(("insert_after_line", init_insert, f"{dst_inner_indent}self.{backing_field} = {backing_default}\\n"))

    # Build property code — inserted after the class end
    prop_code = ""
    if property_getter:
        getter_body_start = property_getter.body[0].lineno - 1
        getter_body_end = property_getter.body[-1].end_lineno
        getter_body = "".join(lines[getter_body_start:getter_body_end]).rstrip()
        getter_body = textwrap.dedent(getter_body)
        getter_body = textwrap.indent(getter_body, dst_inner_indent)
        prop_code += f"\\n{dst_body_indent}@property\\n{dst_body_indent}def {field}(self):\\n{getter_body}\\n"
    if property_setter:
        setter_param_names = [a.arg for a in property_setter.args.args if a.arg != "self"]
        value_param = setter_param_names[0] if setter_param_names else "value"
        setter_body_start = property_setter.body[0].lineno - 1
        setter_body_end = property_setter.body[-1].end_lineno
        setter_body = "".join(lines[setter_body_start:setter_body_end]).rstrip()
        setter_body = textwrap.dedent(setter_body)
        setter_body = textwrap.indent(setter_body, dst_inner_indent)
        prop_code += f"\\n{dst_body_indent}@{field}.setter\\n{dst_body_indent}def {field}(self, {value_param}):\\n{setter_body}\\n"
    if property_deleter:
        deleter_body_start = property_deleter.body[0].lineno - 1
        deleter_body_end = property_deleter.body[-1].end_lineno
        deleter_body = "".join(lines[deleter_body_start:deleter_body_end]).rstrip()
        deleter_body = textwrap.dedent(deleter_body)
        deleter_body = textwrap.indent(deleter_body, dst_inner_indent)
        prop_code += f"\\n{dst_body_indent}@{field}.deleter\\n{dst_body_indent}def {field}(self):\\n{deleter_body}\\n"

    # Use dst_end + 1 to ensure property code goes AFTER the backing field insert
    edits.append(("insert_after_line", dst_end + 1, prop_code))

elif field_kind == "dataclass":
    # Add field annotation to destination class body
    field_decl = f"{dst_body_indent}{field}: {field_type}"
    if field_default is not None:
        field_decl += f" = {field_default}"
    field_decl += "\\n"
    # Insert at end of dataclass field declarations (before first method)
    insert_pos = None
    for stmt in dst_cls.body:
        if isinstance(stmt, (ast.FunctionDef, ast.AsyncFunctionDef)):
            insert_pos = stmt.lineno - 1
            break
    if insert_pos is None:
        insert_pos = dst_end
    edits.append(("insert_before_line", insert_pos, field_decl))

elif field_kind == "slots":
    # Add self.field = default in destination __init__
    init_insert = None
    for stmt in dst_cls.body:
        if isinstance(stmt, ast.FunctionDef) and stmt.name == "__init__":
            init_insert = stmt.body[-1].end_lineno
            break
    default_val = field_default if field_default else "None"
    if init_insert is not None:
        edits.append(("insert_after_line", init_insert, f"{dst_inner_indent}self.{field} = {default_val}\\n"))

elif field_kind == "plain":
    # Add self.field = default in destination __init__
    init_insert = None
    for stmt in dst_cls.body:
        if isinstance(stmt, ast.FunctionDef) and stmt.name == "__init__":
            init_insert = stmt.body[-1].end_lineno
            break
    default_val = field_default if field_default else "None"
    if init_insert is not None:
        assign_text = f"{dst_inner_indent}self.{field}"
        if field_type:
            assign_text += f": {field_type}"
        assign_text += f" = {default_val}\\n"
        edits.append(("insert_after_line", init_insert, assign_text))

# ── Step 4: Update references in source class ──
# self.field -> self.via.field in source class methods

src_node_ids = set(id(n) for n in ast.walk(src_cls))
ref_edits = []

for node in ast.walk(src_cls):
    if isinstance(node, ast.Attribute) and node.attr == field:
        if isinstance(node.value, ast.Name) and node.value.id == "self":
            # Don't update the assignment we're removing
            if field_assign_line is not None and node.value.lineno - 1 == field_assign_line:
                continue
            # Don't update property definitions
            if field_kind == "property":
                # Skip references inside the property methods themselves
                skip = False
                for m in [property_getter, property_setter, property_deleter]:
                    if m is not None:
                        m_ids = set(id(n2) for n2 in ast.walk(m))
                        if id(node) in m_ids:
                            skip = True
                            break
                if skip:
                    continue
            # Replace self.field with self.via.field
            line_idx = node.value.lineno - 1
            col_start = node.value.col_offset
            col_end = node.end_col_offset
            ref_edits.append((line_idx, col_start, col_end, f"self.{via}.{field}"))

# Also update references to backing field for properties
if field_kind == "property":
    backing_field_name = f"_{field}"
    for node in ast.walk(src_cls):
        if isinstance(node, ast.Attribute) and node.attr == backing_field_name:
            if isinstance(node.value, ast.Name) and node.value.id == "self":
                # Skip if inside a property method (being removed)
                skip = False
                for m in [property_getter, property_setter, property_deleter]:
                    if m is not None:
                        m_ids = set(id(n2) for n2 in ast.walk(m))
                        if id(node) in m_ids:
                            skip = True
                            break
                if skip:
                    continue
                if backing_assign_line is not None and node.value.lineno - 1 == backing_assign_line:
                    continue
                line_idx = node.value.lineno - 1
                col_start = node.value.col_offset
                col_end = node.end_col_offset
                ref_edits.append((line_idx, col_start, col_end, f"self.{via}.{field}"))

# ── Apply all edits ──

new_lines = list(lines)

# Apply column-level reference edits first (these don't change line count)
ref_edits.sort(key=lambda e: (e[0], e[1]), reverse=True)
for line_idx, col_start, col_end, replacement in ref_edits:
    line = new_lines[line_idx]
    new_lines[line_idx] = line[:col_start] + replacement + line[col_end:]

# Normalize all line-level edits into a unified list with sort keys
# Each entry: (line_number, priority, action)
# priority: delete=0, replace=1, insert_before=2, insert_after=3
# Process in reverse line order so earlier edits don't shift later ones
unified = []
for e in edits:
    op = e[0]
    if op == "delete_lines":
        unified.append((e[1], 0, "delete", e[1], e[2], None))
    elif op == "replace_lines":
        unified.append((e[1], 1, "replace", e[1], e[2], e[3]))
    elif op == "insert_before_line":
        unified.append((e[1], 2, "insert_before", e[1], None, e[2]))
    elif op == "insert_after_line":
        unified.append((e[1], 3, "insert_after", e[1], None, e[2]))

# Sort by line descending, then priority descending (inserts before deletes at same line)
unified.sort(key=lambda x: (x[0], x[1]), reverse=True)

for _, _, action, line, end, text in unified:
    if action == "delete":
        del new_lines[line:end]
    elif action == "replace":
        new_lines[line:end] = [text]
    elif action == "insert_before":
        new_lines.insert(line, text)
    elif action == "insert_after":
        new_lines.insert(line, text)

new_source = "".join(new_lines)

print(json.dumps({
    "success": True,
    "newSource": new_source,
    "error": "",
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
