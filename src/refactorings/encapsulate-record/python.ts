import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import type { PreconditionResult, RefactoringResult } from "../../core/refactoring.types.js";
import { definePythonRefactoring, pythonParam } from "../../python/python-refactoring-builder.js";
import type { PythonProjectContext } from "../../python/python-refactoring-builder.js";

export const encapsulateRecordPython = definePythonRefactoring({
  name: "Encapsulate Record (Python)",
  kebabName: "encapsulate-record-python",
  tier: 3,
  description:
    "Converts a plain dict, TypedDict, or NamedTuple into a dataclass with typed fields and accessors.",
  params: [
    pythonParam.file(),
    pythonParam.identifier("target", "Name of the variable, TypedDict, or NamedTuple to encapsulate"),
    pythonParam.string("className", "Name for the generated class (defaults to capitalized target)", false),
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

    const result = validateTarget(source, target);
    if (!result.valid) {
      errors.push(result.error);
    }

    return { ok: errors.length === 0, errors };
  },
  apply(ctx: PythonProjectContext, params: Record<string, unknown>): RefactoringResult {
    const file = params["file"] as string;
    const target = params["target"] as string;
    const className = (params["className"] as string | undefined) ?? capitalize(target);

    const filePath = path.resolve(ctx.projectRoot, file);

    let source: string;
    try {
      source = readFileSync(filePath, "utf-8");
    } catch {
      return { success: false, filesChanged: [], description: `File not found: ${file}` };
    }

    const result = transformRecord(source, target, className);

    if (!result.success) {
      return { success: false, filesChanged: [], description: result.error };
    }

    writeFileSync(filePath, result.newSource, "utf-8");

    return {
      success: true,
      filesChanged: [file],
      description: `Encapsulated record '${target}' as dataclass '${className}'`,
    };
  },
});

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

interface ValidateResult {
  valid: boolean;
  error: string;
}

function validateTarget(source: string, target: string): ValidateResult {
  const script = `
import ast, sys, json

source = sys.stdin.read()
target = ${JSON.stringify(target)}
tree = ast.parse(source)
found = False

for node in ast.iter_child_nodes(tree):
    if isinstance(node, ast.ClassDef) and node.name == target:
        for base in node.bases:
            name = base.id if isinstance(base, ast.Name) else (base.attr if isinstance(base, ast.Attribute) else "")
            if name in ("TypedDict", "NamedTuple"):
                found = True
                break
    if isinstance(node, ast.Assign):
        for t in node.targets:
            if isinstance(t, ast.Name) and t.id == target:
                found = True

if found:
    print(json.dumps({"valid": True, "error": ""}))
else:
    print(json.dumps({"valid": False, "error": f"No record named '{target}' found"}))
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

function transformRecord(source: string, target: string, className: string): TransformResult {
  const script = `
import ast, sys, json

source = sys.stdin.read()
target = ${JSON.stringify(target)}
class_name = ${JSON.stringify(className)}

tree = ast.parse(source)
lines = source.splitlines(True)

# --- Phase 1: Detect record type and extract fields ---

record_type = None
fields = []  # [{"name": str, "type": str, "default": str|None}]
record_start = None  # 0-indexed line
record_end = None    # 0-indexed exclusive
is_type_definition = False  # True for TypedDict/NamedTuple class defs (no instance var)

for node in ast.iter_child_nodes(tree):
    if isinstance(node, ast.ClassDef) and node.name == target:
        for base in node.bases:
            bn = base.id if isinstance(base, ast.Name) else (base.attr if isinstance(base, ast.Attribute) else "")
            if bn == "TypedDict":
                record_type = "typeddict_class"
                is_type_definition = True
                record_start = node.lineno - 1
                record_end = node.end_lineno
                for stmt in node.body:
                    if isinstance(stmt, ast.AnnAssign) and isinstance(stmt.target, ast.Name):
                        ft = ast.get_source_segment(source, stmt.annotation) or "str"
                        default = ast.get_source_segment(source, stmt.value) if stmt.value else None
                        fields.append({"name": stmt.target.id, "type": ft, "default": default})
                break
            if bn == "NamedTuple":
                record_type = "namedtuple_class"
                is_type_definition = True
                record_start = node.lineno - 1
                record_end = node.end_lineno
                for stmt in node.body:
                    if isinstance(stmt, ast.AnnAssign) and isinstance(stmt.target, ast.Name):
                        ft = ast.get_source_segment(source, stmt.annotation) or "str"
                        default = ast.get_source_segment(source, stmt.value) if stmt.value else None
                        fields.append({"name": stmt.target.id, "type": ft, "default": default})
                break

    if isinstance(node, ast.Assign) and not record_type:
        for t in node.targets:
            if isinstance(t, ast.Name) and t.id == target:
                record_start = node.lineno - 1
                record_end = node.end_lineno
                val = node.value

                if isinstance(val, ast.Dict):
                    record_type = "dict"
                    for k, v in zip(val.keys, val.values):
                        if isinstance(k, ast.Constant) and isinstance(k.value, str):
                            vt = "str"
                            if isinstance(v, ast.Constant):
                                if isinstance(v.value, bool):
                                    vt = "bool"
                                elif isinstance(v.value, int):
                                    vt = "int"
                                elif isinstance(v.value, float):
                                    vt = "float"
                            val_text = ast.get_source_segment(source, v)
                            fields.append({"name": str(k.value), "type": vt, "default": val_text})

                elif isinstance(val, ast.Call):
                    fn = val.func.id if isinstance(val.func, ast.Name) else (val.func.attr if isinstance(val.func, ast.Attribute) else "")
                    if fn == "TypedDict":
                        record_type = "typeddict_call"
                        is_type_definition = True
                        if len(val.args) >= 2 and isinstance(val.args[1], ast.Dict):
                            for k, v in zip(val.args[1].keys, val.args[1].values):
                                if isinstance(k, ast.Constant):
                                    ft = ast.get_source_segment(source, v) or "str"
                                    fields.append({"name": str(k.value), "type": ft, "default": None})
                    elif fn == "NamedTuple":
                        record_type = "namedtuple_call"
                        is_type_definition = True
                        if len(val.args) >= 2 and isinstance(val.args[1], (ast.List, ast.Tuple)):
                            for elt in val.args[1].elts:
                                if isinstance(elt, ast.Tuple) and len(elt.elts) >= 2:
                                    if isinstance(elt.elts[0], ast.Constant):
                                        ft = ast.get_source_segment(source, elt.elts[1]) or "str"
                                        fields.append({"name": str(elt.elts[0].value), "type": ft, "default": None})
                    else:
                        record_type = "dict"
                        for kw in val.keywords:
                            if kw.arg:
                                fields.append({"name": kw.arg, "type": "str", "default": None})
                break

if not record_type or not fields:
    print(json.dumps({"success": False, "error": f"No record found for '{target}'", "newSource": ""}))
    sys.exit(0)

# --- Phase 2: Build the dataclass ---

# Check existing imports
has_dataclass_import = False
last_import_line = 0
for node in ast.iter_child_nodes(tree):
    if isinstance(node, (ast.Import, ast.ImportFrom)):
        last_import_line = node.end_lineno  # 1-indexed
        if isinstance(node, ast.ImportFrom) and node.module == "dataclasses":
            for alias in node.names:
                if alias.name == "dataclass":
                    has_dataclass_import = True

# Order fields: no-default first, then with defaults
no_def = [f for f in fields if f["default"] is None]
with_def = [f for f in fields if f["default"] is not None]
ordered = no_def + with_def

field_lines = []
for f in ordered:
    if f["default"] is not None:
        field_lines.append(f"    {f['name']}: {f['type']} = {f['default']}")
    else:
        field_lines.append(f"    {f['name']}: {f['type']}")

dc_code = "@dataclass\\nclass " + class_name + ":\\n" + "\\n".join(field_lines) + "\\n"

# --- Phase 3: Build the new source ---

new_lines = list(lines)

# For plain dicts: replace dict literal with constructor call, insert class above
# For TypedDict/NamedTuple: replace the type definition with dataclass
if record_type == "dict":
    # Build constructor call from original dict values
    kw_parts = []
    for f in fields:
        if f["default"] is not None:
            kw_parts.append(f"{f['name']}={f['default']}")
    ctor_call = class_name + "(" + ", ".join(kw_parts) + ")"
    assign_line = target + " = " + ctor_call + "\\n"

    # Replace the dict assignment with constructor call
    new_lines[record_start:record_end] = [assign_line]

    # Insert class definition before the assignment
    class_block = ""
    if not has_dataclass_import:
        if last_import_line > 0 and last_import_line <= record_start:
            # Insert import at last_import_line, class before assignment
            new_lines.insert(last_import_line, "from dataclasses import dataclass\\n")
            # record_start shifted by 1
            new_lines.insert(record_start + 1, "\\n" + dc_code + "\\n")
        else:
            # No imports above — put import + class before assignment
            new_lines.insert(record_start, "from dataclasses import dataclass\\n\\n" + dc_code + "\\n")
    else:
        new_lines.insert(record_start, "\\n" + dc_code + "\\n")
else:
    # TypedDict/NamedTuple: replace class/call with dataclass
    new_lines[record_start:record_end] = [dc_code]

    if not has_dataclass_import:
        if last_import_line > 0 and last_import_line <= record_start:
            new_lines.insert(last_import_line, "from dataclasses import dataclass\\n")
        else:
            new_lines.insert(record_start, "from dataclasses import dataclass\\n\\n")

# --- Phase 4: Rewrite access patterns ---

new_source = "".join(new_lines)
new_tree = ast.parse(new_source)
new_lines2 = new_source.splitlines(True)

field_names = [f["name"] for f in fields]
edits = []

for node in ast.walk(new_tree):
    # d["key"] -> d.key
    if isinstance(node, ast.Subscript):
        if isinstance(node.value, ast.Name):
            var_name = node.value.id
            # For type definitions (TypedDict/NamedTuple), rewrite any variable's subscript access
            # For plain dicts, only rewrite the target variable
            if is_type_definition or var_name == target:
                if isinstance(node.slice, ast.Constant) and isinstance(node.slice.value, str):
                    if node.slice.value in field_names:
                        edits.append({
                            "line": node.lineno - 1,
                            "col": node.col_offset,
                            "end_line": node.end_lineno - 1,
                            "end_col": node.end_col_offset,
                            "replacement": var_name + "." + node.slice.value,
                        })

    # d.get("key") or d.get("key", default) -> d.key
    if isinstance(node, ast.Call):
        if isinstance(node.func, ast.Attribute) and node.func.attr == "get":
            if isinstance(node.func.value, ast.Name):
                var_name = node.func.value.id
                if is_type_definition or var_name == target:
                    if len(node.args) >= 1 and isinstance(node.args[0], ast.Constant) and isinstance(node.args[0].value, str):
                        if node.args[0].value in field_names:
                            edits.append({
                                "line": node.lineno - 1,
                                "col": node.col_offset,
                                "end_line": node.end_lineno - 1,
                                "end_col": node.end_col_offset,
                                "replacement": var_name + "." + node.args[0].value,
                            })

# Sort reverse, deduplicate
edits.sort(key=lambda e: (e["line"], e["col"]), reverse=True)
seen = set()
unique = []
for e in edits:
    k = (e["line"], e["col"])
    if k not in seen:
        seen.add(k)
        unique.append(e)
edits = unique

for e in edits:
    if e["line"] == e["end_line"]:
        ln = new_lines2[e["line"]]
        new_lines2[e["line"]] = ln[:e["col"]] + e["replacement"] + ln[e["end_col"]:]
    else:
        first = new_lines2[e["line"]]
        last = new_lines2[e["end_line"]]
        new_lines2[e["line"]] = first[:e["col"]] + e["replacement"] + last[e["end_col"]:]
        del new_lines2[e["line"] + 1:e["end_line"] + 1]

final = "".join(new_lines2)

# --- Phase 5: Clean up old type imports ---

if record_type in ("typeddict_class", "typeddict_call"):
    # Remove TypedDict from imports if no longer used
    final_tree = ast.parse(final)
    still_used = False
    for node in ast.walk(final_tree):
        if isinstance(node, ast.Name) and node.id == "TypedDict":
            still_used = True
            break
    if not still_used:
        fl = final.splitlines(True)
        cleaned = []
        for ln in fl:
            if "TypedDict" in ln and "import" in ln:
                c = ln.replace(", TypedDict", "").replace("TypedDict, ", "").replace("TypedDict", "")
                if c.strip() and c.strip() not in ("from typing import", "from typing import\\n"):
                    cleaned.append(c)
            else:
                cleaned.append(ln)
        final = "".join(cleaned)

if record_type in ("namedtuple_class", "namedtuple_call"):
    final_tree = ast.parse(final)
    still_used = False
    for node in ast.walk(final_tree):
        if isinstance(node, ast.Name) and node.id == "NamedTuple":
            still_used = True
            break
    if not still_used:
        fl = final.splitlines(True)
        cleaned = []
        for ln in fl:
            if "NamedTuple" in ln and "import" in ln:
                c = ln.replace(", NamedTuple", "").replace("NamedTuple, ", "").replace("NamedTuple", "")
                if c.strip() and c.strip() not in ("from typing import", "from typing import\\n"):
                    cleaned.append(c)
            else:
                cleaned.append(ln)
        final = "".join(cleaned)

print(json.dumps({"success": True, "newSource": final}))
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
