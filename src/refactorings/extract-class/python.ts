import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import type { PreconditionResult, RefactoringResult } from "../../core/refactoring.types.js";
import { definePythonRefactoring, pythonParam } from "../../python/python-refactoring-builder.js";
import type { PythonProjectContext } from "../../python/python-refactoring-builder.js";

export const extractClassPython = definePythonRefactoring({
  name: "Extract Class (Python)",
  kebabName: "extract-class-python",
  tier: 3,
  description:
    "Extracts fields from a class into a new class and adds a delegate field to the original.",
  params: [
    pythonParam.file(),
    pythonParam.identifier("target", "Name of the source class"),
    pythonParam.string("fields", "Comma-separated field names to extract"),
    pythonParam.identifier("newClassName", "Name for the new extracted class"),
  ],
  preconditions(ctx: PythonProjectContext, params: Record<string, unknown>): PreconditionResult {
    const errors: string[] = [];
    const file = params["file"] as string;
    const target = params["target"] as string;
    const fields = params["fields"] as string;
    const newClassName = params["newClassName"] as string;

    const filePath = path.resolve(ctx.projectRoot, file);
    let source: string;
    try {
      source = readFileSync(filePath, "utf-8");
    } catch {
      errors.push(`File not found: ${file}`);
      return { ok: false, errors };
    }

    const result = validateExtractClass(source, target, fields, newClassName);
    if (!result.valid) {
      errors.push(...result.errors);
    }

    return { ok: errors.length === 0, errors };
  },
  apply(ctx: PythonProjectContext, params: Record<string, unknown>): RefactoringResult {
    const file = params["file"] as string;
    const target = params["target"] as string;
    const fields = params["fields"] as string;
    const newClassName = params["newClassName"] as string;

    const filePath = path.resolve(ctx.projectRoot, file);

    let source: string;
    try {
      source = readFileSync(filePath, "utf-8");
    } catch {
      return { success: false, filesChanged: [], description: `File not found: ${file}` };
    }

    const result = applyExtractClass(source, target, fields, newClassName);

    if (!result.success) {
      return { success: false, filesChanged: [], description: result.error };
    }

    writeFileSync(filePath, result.newSource, "utf-8");

    return {
      success: true,
      filesChanged: [file],
      description: `Extracted fields [${fields}] from '${target}' into new class '${newClassName}'`,
    };
  },
});

interface ValidateResult {
  valid: boolean;
  errors: string[];
}

function validateExtractClass(
  source: string,
  target: string,
  fields: string,
  newClassName: string,
): ValidateResult {
  const script = `
import ast
import sys
import json

source = sys.stdin.read()
target = ${JSON.stringify(target)}
fields_str = ${JSON.stringify(fields)}
new_class_name = ${JSON.stringify(newClassName)}

tree = ast.parse(source)
errors = []

field_names = [f.strip() for f in fields_str.split(",") if f.strip()]

# Find target class
target_cls = None
for node in ast.iter_child_nodes(tree):
    if isinstance(node, ast.ClassDef) and node.name == target:
        target_cls = node

if target_cls is None:
    errors.append(f"Class '{target}' not found")
else:
    # Check if new class name already exists
    for node in ast.iter_child_nodes(tree):
        if isinstance(node, ast.ClassDef) and node.name == new_class_name:
            errors.append(f"Class '{new_class_name}' already exists in file")

    if not errors:
        # Check if dataclass
        is_dataclass = any(
            (isinstance(d, ast.Name) and d.id == "dataclass") or
            (isinstance(d, ast.Call) and isinstance(d.func, ast.Name) and d.func.id == "dataclass")
            for d in target_cls.decorator_list
        )

        if is_dataclass:
            # Check fields exist as class-level annotations
            dc_fields = set()
            for stmt in target_cls.body:
                if isinstance(stmt, ast.AnnAssign) and isinstance(stmt.target, ast.Name):
                    dc_fields.add(stmt.target.id)
            for fn in field_names:
                if fn not in dc_fields:
                    errors.append(f"Field '{fn}' not found on dataclass '{target}'")
        else:
            # Check fields exist as self.X assignments in __init__
            init_fields = set()
            for stmt in target_cls.body:
                if isinstance(stmt, ast.FunctionDef) and stmt.name == "__init__":
                    for s in stmt.body:
                        if isinstance(s, ast.Assign):
                            for t in s.targets:
                                if (isinstance(t, ast.Attribute) and isinstance(t.value, ast.Name)
                                        and t.value.id == "self"):
                                    init_fields.add(t.attr)
                        elif isinstance(s, ast.AnnAssign):
                            if (isinstance(s.target, ast.Attribute)
                                    and isinstance(s.target.value, ast.Name)
                                    and s.target.value.id == "self"):
                                init_fields.add(s.target.attr)
            for fn in field_names:
                if fn not in init_fields:
                    errors.append(f"Field '{fn}' not found in __init__ of class '{target}'")

if not field_names:
    errors.append("No fields specified to extract")

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

function applyExtractClass(
  source: string,
  target: string,
  fields: string,
  newClassName: string,
): TransformResult {
  const script = `
import ast
import sys
import json
import re
import textwrap

source = sys.stdin.read()
target_name = ${JSON.stringify(target)}
fields_str = ${JSON.stringify(fields)}
new_class_name = ${JSON.stringify(newClassName)}

tree = ast.parse(source)
lines = source.splitlines(True)

field_names = [f.strip() for f in fields_str.split(",") if f.strip()]

# Delegate field name: PascalCase -> snake_case
delegate_name = re.sub(r'(?<=[a-z])([A-Z])', r'_\\1', new_class_name).lower()

# Find target class
target_cls = None
for node in ast.iter_child_nodes(tree):
    if isinstance(node, ast.ClassDef) and node.name == target_name:
        target_cls = node

if target_cls is None:
    print(json.dumps({"success": False, "newSource": "", "error": f"Class '{target_name}' not found"}))
    sys.exit(0)

# Check if dataclass
is_dataclass = any(
    (isinstance(d, ast.Name) and d.id == "dataclass") or
    (isinstance(d, ast.Call) and isinstance(d.func, ast.Name) and d.func.id == "dataclass")
    for d in target_cls.decorator_list
)

# ── Determine body indentation ──
body_indent = "    "
if target_cls.body:
    first_line = lines[target_cls.body[0].lineno - 1]
    body_indent = first_line[:len(first_line) - len(first_line.lstrip())]

inner_indent = body_indent + "    "

if is_dataclass:
    # ═══ DATACLASS PATH ═══

    # Collect all field declarations
    all_dc_fields = []  # (name, type_text, default_text, lineno, end_lineno)
    for stmt in target_cls.body:
        if isinstance(stmt, ast.AnnAssign) and isinstance(stmt.target, ast.Name):
            type_text = ast.get_source_segment(source, stmt.annotation)
            default_text = ast.get_source_segment(source, stmt.value) if stmt.value else None
            all_dc_fields.append((stmt.target.id, type_text, default_text, stmt.lineno, stmt.end_lineno))

    extracted = [(n, t, d, ln, eln) for n, t, d, ln, eln in all_dc_fields if n in field_names]
    remaining = [(n, t, d, ln, eln) for n, t, d, ln, eln in all_dc_fields if n not in field_names]

    if not extracted:
        print(json.dumps({"success": False, "newSource": "", "error": "No matching fields found"}))
        sys.exit(0)

    # Build new dataclass text
    new_class_lines = ["@dataclass"]
    new_class_lines.append(f"class {new_class_name}:")
    for name, type_text, default_text, _, _ in extracted:
        if default_text:
            new_class_lines.append(f"{body_indent}{name}: {type_text} = {default_text}")
        else:
            new_class_lines.append(f"{body_indent}{name}: {type_text}")

    new_class_text = "\\n".join(new_class_lines)

    # Build modified target class
    # Remove extracted field lines, add delegate field
    target_start = target_cls.lineno - 1
    if target_cls.decorator_list:
        target_start = target_cls.decorator_list[0].lineno - 1
    target_end = target_cls.end_lineno

    # Rebuild target class body
    new_target_lines = []

    # Copy class header (decorators + class line)
    class_header_end = target_cls.body[0].lineno - 1
    for i in range(target_start, class_header_end):
        new_target_lines.append(lines[i].rstrip())

    # Add remaining fields + delegate field
    for name, type_text, default_text, _, _ in remaining:
        if default_text:
            new_target_lines.append(f"{body_indent}{name}: {type_text} = {default_text}")
        else:
            new_target_lines.append(f"{body_indent}{name}: {type_text}")

    # Add delegate field (after remaining fields, before methods)
    new_target_lines.append(f"{body_indent}{delegate_name}: {new_class_name} = None  # type: ignore")

    # Copy methods and other non-field body items
    for stmt in target_cls.body:
        if isinstance(stmt, ast.AnnAssign):
            continue  # Skip all field declarations (already handled)
        start = stmt.lineno - 1
        if hasattr(stmt, 'decorator_list') and stmt.decorator_list:
            start = stmt.decorator_list[0].lineno - 1
        end = stmt.end_lineno
        new_target_lines.append("")  # blank line before method
        for i in range(start, end):
            line_text = lines[i].rstrip()
            # Rewrite self.field -> self.delegate.field
            for fn in field_names:
                line_text = re.sub(r'self\\.' + re.escape(fn) + r'(?![a-zA-Z0-9_])', f'self.{delegate_name}.{fn}', line_text)
            new_target_lines.append(line_text)

    # Add __post_init__ to create delegate from fields
    new_target_lines.append("")
    new_target_lines.append(f"{body_indent}def __post_init__(self):")
    ctor_args = ", ".join(f"{fn}=self.{fn}" for fn in field_names)
    new_target_lines.append(f"{inner_indent}self.{delegate_name} = {new_class_name}({ctor_args})")

    new_target_text = "\\n".join(new_target_lines)

    # Now update call sites for the target class
    # Find all ClassName(...) calls and rewrite extracted keyword args
    # and positional args into NewClass(...)

    # Assemble the output first, then update call sites
    before_target = "".join(lines[:target_start])
    after_target = "".join(lines[target_end:])

    new_source = before_target.rstrip("\\n") + "\\n\\n" + new_class_text + "\\n\\n" + new_target_text + "\\n"
    if after_target.strip():
        new_source += "\\n" + after_target.lstrip("\\n")

    # Update call sites: find ClassName(...) with keyword args matching extracted fields
    # Parse the new source and rewrite
    new_tree = ast.parse(new_source)
    new_lines = new_source.splitlines(True)
    edits = []  # (line_idx, old_text, new_text)

    for node in ast.walk(new_tree):
        if not isinstance(node, ast.Call):
            continue
        if isinstance(node.func, ast.Name) and node.func.id == target_name:
            # Check if any keyword args match extracted fields
            has_extracted_kw = any(kw.arg in field_names for kw in node.keywords if kw.arg)
            if not has_extracted_kw and not node.args:
                continue

            # Get original call text
            call_start_line = node.lineno - 1
            call_end_line = node.end_lineno

            # For keyword calls, rebuild the argument list
            if node.keywords and any(kw.arg in field_names for kw in node.keywords if kw.arg):
                # Separate remaining kwargs from extracted kwargs
                remaining_args = []
                extracted_args = []

                for kw in node.keywords:
                    if kw.arg and kw.arg in field_names:
                        extracted_args.append((kw.arg, ast.get_source_segment(new_source, kw.value)))
                    else:
                        seg = ast.get_source_segment(new_source, kw)
                        if seg:
                            remaining_args.append(seg)

                # Also keep positional args
                pos_args = []
                for a in node.args:
                    seg = ast.get_source_segment(new_source, a)
                    if seg:
                        pos_args.append(seg)

                # Build delegate constructor call
                delegate_ctor_args = ", ".join(f"{n}={v}" for n, v in extracted_args)
                delegate_ctor = f"{new_class_name}({delegate_ctor_args})"

                # Build new call
                all_args = pos_args + remaining_args + [f"{delegate_name}={delegate_ctor}"]
                new_call_args = ", ".join(all_args)

                # Get the function name text
                func_text = ast.get_source_segment(new_source, node.func)
                new_call = f"{func_text}({new_call_args})"

                # Get original call text span
                orig_call = ast.get_source_segment(new_source, node)
                if orig_call:
                    edits.append((orig_call, new_call))

            elif node.args and len(node.args) > 0:
                # Positional args — need to know field order in original class
                all_field_order = [n for n, _, _, _, _ in all_dc_fields]
                extracted_indices = [all_field_order.index(fn) for fn in field_names if fn in all_field_order]
                remaining_indices = [i for i in range(len(all_field_order)) if i not in extracted_indices]

                if len(node.args) == len(all_field_order):
                    pos_texts = [ast.get_source_segment(new_source, a) for a in node.args]
                    remaining_pos = [pos_texts[i] for i in remaining_indices]
                    extracted_pos = [(field_names[extracted_indices.index(i)] if i in extracted_indices else None, pos_texts[i])
                                     for i in extracted_indices]
                    # Rebuild: remaining positional + delegate ctor
                    delegate_ctor_args = ", ".join(f"{fn}={v}" for fn, v in extracted_pos if fn)
                    delegate_ctor = f"{new_class_name}({delegate_ctor_args})"

                    func_text = ast.get_source_segment(new_source, node.func)
                    all_parts = remaining_pos + [delegate_ctor]
                    new_call = f"{func_text}({', '.join(all_parts)})"

                    orig_call = ast.get_source_segment(new_source, node)
                    if orig_call:
                        edits.append((orig_call, new_call))

    # Apply call site edits
    for old_text, new_text in edits:
        new_source = new_source.replace(old_text, new_text, 1)

    # Remove __post_init__ if it was added (we handle initialization via call sites now)
    # Actually, keep __post_init__ to handle the delegate setup from the remaining constructor

    # Actually, for dataclass, we should remove the kept fields and update __post_init__
    # to just assign from the delegate arg. Let me revise:
    # The approach: keep extracted fields removed from dataclass, add delegate field,
    # add __post_init__ that does nothing (delegate is passed directly)
    # Call sites pass NewClass(...) as the delegate param

    # Re-parse and remove __post_init__ since delegate is now passed directly
    new_source2 = new_source
    try:
        tree2 = ast.parse(new_source2)
        new_lines2 = new_source2.splitlines(True)
        remove_ranges = []
        for node in ast.walk(tree2):
            if isinstance(node, ast.ClassDef) and node.name == target_name:
                for stmt in node.body:
                    if isinstance(stmt, ast.FunctionDef) and stmt.name == "__post_init__":
                        # Remove __post_init__ and its preceding blank line
                        start = stmt.lineno - 1
                        end = stmt.end_lineno
                        # Check for preceding blank line
                        if start > 0 and new_lines2[start - 1].strip() == "":
                            start -= 1
                        remove_ranges.append((start, end))

        if remove_ranges:
            for start, end in sorted(remove_ranges, reverse=True):
                del new_lines2[start:end]
            new_source = "".join(new_lines2)

        # Also fix the delegate field: remove "= None  # type: ignore"
        new_source = re.sub(
            re.escape(delegate_name) + r': ' + re.escape(new_class_name) + r' = None  # type: ignore',
            f'{delegate_name}: {new_class_name}',
            new_source
        )
    except:
        pass

else:
    # ═══ REGULAR CLASS PATH ═══

    target_init = None
    for stmt in target_cls.body:
        if isinstance(stmt, ast.FunctionDef) and stmt.name == "__init__":
            target_init = stmt

    if target_init is None:
        print(json.dumps({"success": False, "newSource": "", "error": f"No __init__ found on class '{target_name}'"}))
        sys.exit(0)

    # Collect field info from __init__
    # field_info: [(name, type_annotation, init_value, stmt_lineno, stmt_end_lineno)]
    field_info = []
    for s in target_init.body:
        if isinstance(s, ast.Assign):
            for t in s.targets:
                if (isinstance(t, ast.Attribute) and isinstance(t.value, ast.Name)
                        and t.value.id == "self" and t.attr in field_names):
                    init_val = ast.get_source_segment(source, s.value)
                    field_info.append((t.attr, None, init_val, s.lineno, s.end_lineno))
        elif isinstance(s, ast.AnnAssign):
            if (isinstance(s.target, ast.Attribute) and isinstance(s.target.value, ast.Name)
                    and s.target.value.id == "self" and s.target.attr in field_names):
                type_text = ast.get_source_segment(source, s.annotation) if s.annotation else None
                init_val = ast.get_source_segment(source, s.value) if s.value else None
                field_info.append((s.target.attr, type_text, init_val, s.lineno, s.end_lineno))

    if not field_info:
        print(json.dumps({"success": False, "newSource": "", "error": "No matching fields found in __init__"}))
        sys.exit(0)

    # Order field_info by field_names order
    field_info_dict = {fi[0]: fi for fi in field_info}
    field_info = [field_info_dict[fn] for fn in field_names if fn in field_info_dict]

    # Build new class text
    params_list = [fi[0] for fi in field_info]
    new_class_lines = [f"class {new_class_name}:"]

    # Build __init__ with type annotations if available
    init_params = ["self"]
    for name, type_ann, _, _, _ in field_info:
        if type_ann:
            init_params.append(f"{name}: {type_ann}")
        else:
            init_params.append(name)

    new_class_lines.append(f"{body_indent}def __init__(self, {', '.join(init_params[1:])}):")
    for name, type_ann, _, _, _ in field_info:
        if type_ann:
            new_class_lines.append(f"{inner_indent}self.{name}: {type_ann} = {name}")
        else:
            new_class_lines.append(f"{inner_indent}self.{name} = {name}")

    new_class_text = "\\n".join(new_class_lines)

    # Build delegate constructor call args (use init values from original)
    ctor_args = ", ".join(fi[2] for fi in field_info if fi[2])
    delegate_assign = f"{inner_indent}self.{delegate_name} = {new_class_name}({ctor_args})"

    # Rebuild the target class
    target_start = target_cls.lineno - 1
    if target_cls.decorator_list:
        target_start = target_cls.decorator_list[0].lineno - 1
    target_end = target_cls.end_lineno

    # Lines to remove from __init__ (extracted field assignments)
    remove_lines = set()
    for _, _, _, ln, eln in field_info:
        for i in range(ln - 1, eln):
            remove_lines.add(i)

    # Rebuild target class lines
    new_target_lines = []

    # Class header
    class_body_start = target_cls.body[0].lineno - 1
    if target_cls.body[0] is target_init and target_init.decorator_list:
        class_body_start = target_init.decorator_list[0].lineno - 1
    for i in range(target_start, class_body_start):
        new_target_lines.append(lines[i].rstrip())

    # Process each body statement
    for stmt in target_cls.body:
        stmt_start = stmt.lineno - 1
        if hasattr(stmt, 'decorator_list') and stmt.decorator_list:
            stmt_start = stmt.decorator_list[0].lineno - 1
        stmt_end = stmt.end_lineno

        if stmt is target_init:
            # Rebuild __init__: copy header, remove extracted field assigns, add delegate assign
            init_header_end = target_init.body[0].lineno - 1
            for i in range(stmt_start, init_header_end):
                new_target_lines.append(lines[i].rstrip())

            # Insert delegate assignment first (before remaining assignments)
            delegate_inserted = False
            for s in target_init.body:
                s_start = s.lineno - 1
                s_end = s.end_lineno
                if s_start in remove_lines:
                    if not delegate_inserted:
                        new_target_lines.append(delegate_assign)
                        delegate_inserted = True
                    continue
                for i in range(s_start, s_end):
                    new_target_lines.append(lines[i].rstrip())

            if not delegate_inserted:
                new_target_lines.append(delegate_assign)
        else:
            # Non-init method: copy with reference rewriting
            if stmt is not target_cls.body[0]:
                new_target_lines.append("")  # blank line before method
            for i in range(stmt_start, stmt_end):
                line_text = lines[i].rstrip()
                for fn in field_names:
                    line_text = re.sub(r'self\\.' + re.escape(fn) + r'(?![a-zA-Z0-9_])', f'self.{delegate_name}.{fn}', line_text)
                new_target_lines.append(line_text)

    new_target_text = "\\n".join(new_target_lines)

    # Assemble output
    before_target = "".join(lines[:target_start])
    after_target = "".join(lines[target_end:])

    new_source = before_target.rstrip("\\n") + "\\n\\n" + new_class_text + "\\n\\n" + new_target_text + "\\n"
    if after_target.strip():
        new_source += "\\n" + after_target.lstrip("\\n")

# ── Update __all__ if present ──
new_source_lines = new_source.splitlines(True)
for node in ast.iter_child_nodes(tree):
    if isinstance(node, ast.Assign):
        for t in node.targets:
            if isinstance(t, ast.Name) and t.id == "__all__":
                q = '[' + chr(34) + chr(39) + ']'
                for li in range(len(new_source_lines)):
                    if '__all__' in new_source_lines[li] and target_name in new_source_lines[li]:
                        line = new_source_lines[li]
                        # Add new class name after target name in __all__
                        pattern = '(' + q + re.escape(target_name) + q + ')'
                        repl = r'\\1, ' + chr(34) + new_class_name + chr(34)
                        line = re.sub(pattern, repl, line)
                        new_source_lines[li] = line
                new_source = "".join(new_source_lines)

# Clean up excessive blank lines
new_source = re.sub(r'\\n{4,}', '\\n\\n\\n', new_source)

# Ensure file ends with single newline
new_source = new_source.rstrip() + "\\n"

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
