import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import type { PreconditionResult, RefactoringResult } from "../../core/refactoring.types.js";
import { definePythonRefactoring, pythonParam } from "../../python/python-refactoring-builder.js";
import type { PythonProjectContext } from "../../python/python-refactoring-builder.js";
import { parsePython } from "../../python/tree-sitter-parser.js";

export const renamePythonField = definePythonRefactoring({
  name: "Rename Field (Python)",
  kebabName: "rename-field-python",
  tier: 1,
  description:
    "Renames a class field/attribute and all its references, handling properties, dataclasses, NamedTuples, TypedDicts, __slots__, and name mangling.",
  params: [
    pythonParam.file(),
    pythonParam.identifier("target", "Name of the class containing the field"),
    pythonParam.string("field", "Current name of the field to rename"),
    pythonParam.identifier("newName", "New name for the field"),
  ],
  preconditions(ctx: PythonProjectContext, params: Record<string, unknown>): PreconditionResult {
    const errors: string[] = [];
    const file = params["file"] as string;
    const target = params["target"] as string;
    const newName = params["newName"] as string;

    const filePath = path.resolve(ctx.projectRoot, file);
    let source: string;
    try {
      source = readFileSync(filePath, "utf-8");
    } catch {
      errors.push(`File not found: ${file}`);
      return { ok: false, errors };
    }

    const tree = parsePython(source);
    if (!hasClassDef(tree.rootNode, target)) {
      errors.push(`Class '${target}' not found in ${file}`);
    }

    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(newName)) {
      errors.push(`'${newName}' is not a valid Python identifier`);
    }

    return { ok: errors.length === 0, errors };
  },
  apply(ctx: PythonProjectContext, params: Record<string, unknown>): RefactoringResult {
    const file = params["file"] as string;
    const target = params["target"] as string;
    const field = params["field"] as string;
    const newName = params["newName"] as string;

    const filePath = path.resolve(ctx.projectRoot, file);

    let source: string;
    try {
      source = readFileSync(filePath, "utf-8");
    } catch {
      return { success: false, filesChanged: [], description: `File not found: ${file}` };
    }

    const result = renameField(source, target, field, newName);

    if (!result.success) {
      return { success: false, filesChanged: [], description: result.error };
    }

    writeFileSync(filePath, result.newSource, "utf-8");

    return {
      success: true,
      filesChanged: [file],
      description: `Renamed field '${field}' to '${newName}' on class '${target}' (${result.editCount} references updated)`,
    };
  },
});

interface RenameFieldResult {
  success: boolean;
  newSource: string;
  editCount: number;
  error: string;
}

function renameField(
  source: string,
  className: string,
  oldName: string,
  newName: string,
): RenameFieldResult {
  const script = `
import ast
import sys
import json
import re

source = sys.stdin.read()
class_name = ${JSON.stringify(className)}
old_name = ${JSON.stringify(oldName)}
new_name = ${JSON.stringify(newName)}

tree = ast.parse(source)
lines = source.splitlines(True)

# Determine if old_name uses name mangling (starts with __ but not ending with __)
is_mangled = old_name.startswith("__") and not old_name.endswith("__")
mangled_old = f"_{class_name}{old_name}" if is_mangled else None

new_is_mangled = new_name.startswith("__") and not new_name.endswith("__")
mangled_new = f"_{class_name}{new_name}" if new_is_mangled else None

# Find the target class
class_node = None
for node in ast.walk(tree):
    if isinstance(node, ast.ClassDef) and node.name == class_name:
        class_node = node
        break

if class_node is None:
    print(json.dumps({"success": False, "error": f"Class '{class_name}' not found"}))
    sys.exit(0)

# Determine class kind: normal, dataclass, namedtuple, typeddict
class_kind = "normal"
for base in class_node.bases:
    base_name = ""
    if isinstance(base, ast.Name):
        base_name = base.id
    elif isinstance(base, ast.Attribute):
        base_name = base.attr
    if base_name == "NamedTuple":
        class_kind = "namedtuple"
    elif base_name == "TypedDict":
        class_kind = "typeddict"

for deco in class_node.decorator_list:
    deco_name = ""
    if isinstance(deco, ast.Name):
        deco_name = deco.id
    elif isinstance(deco, ast.Attribute):
        deco_name = deco.attr
    if deco_name == "dataclass":
        class_kind = "dataclass"

edits = []  # (line_idx, col_start, col_end, replacement)

# --- Collect all rename sites ---

# For properties: rename @property def name, @name.setter, @name.deleter
is_property = False
for node in ast.walk(class_node):
    if isinstance(node, ast.FunctionDef) and node.name == old_name:
        for deco in node.decorator_list:
            if isinstance(deco, ast.Name) and deco.id == "property":
                is_property = True
                break

if is_property:
    # Rename property getter def
    for node in ast.walk(class_node):
        if isinstance(node, ast.FunctionDef) and node.name == old_name:
            # Rename the function name
            edits.append((node.lineno - 1, node.col_offset + 4, node.col_offset + 4 + len(old_name), new_name))
            # Also rename decorators like @old_name.setter, @old_name.deleter
            for deco in node.decorator_list:
                if isinstance(deco, ast.Attribute) and isinstance(deco.value, ast.Name):
                    if deco.value.id == old_name:
                        # Replace old_name in decorator
                        edits.append((deco.lineno - 1, deco.value.col_offset, deco.value.col_offset + len(old_name), new_name))

    # Rename backing field _old_name -> _new_name throughout the class
    backing_old = f"_{old_name}"
    backing_new = f"_{new_name}"
    for node in ast.walk(class_node):
        if isinstance(node, ast.Attribute) and node.attr == backing_old:
            edits.append((node.end_lineno - 1, node.end_col_offset - len(backing_old), node.end_col_offset, backing_new))

    # Rename .old_name access outside the class
    for node in ast.walk(tree):
        if isinstance(node, ast.Attribute) and node.attr == old_name:
            # Skip nodes inside the class itself (handled above)
            edits.append((node.end_lineno - 1, node.end_col_offset - len(old_name), node.end_col_offset, new_name))

else:
    # --- Non-property field rename ---

    # 1. Rename attribute accesses: self.field, obj.field
    for node in ast.walk(tree):
        if isinstance(node, ast.Attribute) and node.attr == old_name:
            edits.append((node.end_lineno - 1, node.end_col_offset - len(old_name), node.end_col_offset, new_name))

    # 2. Handle mangled access: obj._ClassName__field -> obj._ClassName__newfield
    if mangled_old:
        for node in ast.walk(tree):
            if isinstance(node, ast.Attribute) and node.attr == mangled_old:
                replacement = mangled_new if mangled_new else new_name
                edits.append((node.end_lineno - 1, node.end_col_offset - len(mangled_old), node.end_col_offset, replacement))

    # 3. Handle class-level annotations (class body assignments like field: int)
    for stmt in class_node.body:
        if isinstance(stmt, ast.AnnAssign) and isinstance(stmt.target, ast.Name):
            if stmt.target.id == old_name:
                edits.append((stmt.target.lineno - 1, stmt.target.col_offset, stmt.target.end_col_offset, new_name))

    # 4. Handle __slots__
    for stmt in class_node.body:
        if isinstance(stmt, ast.Assign):
            for t in stmt.targets:
                if isinstance(t, ast.Name) and t.id == "__slots__":
                    # Find the old_name string in the tuple/list
                    if isinstance(stmt.value, (ast.Tuple, ast.List)):
                        for elt in stmt.value.elts:
                            if isinstance(elt, ast.Constant) and elt.value == old_name:
                                edits.append((elt.lineno - 1, elt.col_offset + 1, elt.end_col_offset - 1, new_name))

    # 5. Handle keyword arguments at call sites: ClassName(field=val)
    if class_kind in ("dataclass", "namedtuple"):
        for node in ast.walk(tree):
            if isinstance(node, ast.Call):
                call_name = ""
                if isinstance(node.func, ast.Name):
                    call_name = node.func.id
                elif isinstance(node.func, ast.Attribute):
                    call_name = node.func.attr
                if call_name == class_name:
                    for kw in node.keywords:
                        if kw.arg == old_name:
                            # keyword arg — replace the arg name
                            # ast doesn't give col_offset for keyword arg names directly
                            # So we find it via text search on the line
                            line_idx = kw.value.lineno - 1
                            line_text = lines[line_idx]
                            # Find "old_name=" before the value
                            val_col = kw.value.col_offset
                            prefix = line_text[:val_col]
                            # Search backward for old_name
                            idx = prefix.rfind(old_name + "=")
                            if idx >= 0:
                                edits.append((line_idx, idx, idx + len(old_name), new_name))

    # 6. Handle TypedDict string-key access: d["field"] and dict literal keys {"field": val}
    if class_kind == "typeddict":
        for node in ast.walk(tree):
            if isinstance(node, ast.Subscript):
                if isinstance(node.slice, ast.Constant) and node.slice.value == old_name:
                    # Replace the string literal contents
                    edits.append((node.slice.lineno - 1, node.slice.col_offset + 1, node.slice.end_col_offset - 1, new_name))
            if isinstance(node, ast.Dict):
                for key in node.keys:
                    if isinstance(key, ast.Constant) and key.value == old_name:
                        edits.append((key.lineno - 1, key.col_offset + 1, key.end_col_offset - 1, new_name))

    # 7. Handle NamedTuple/TypedDict field definitions in class body
    if class_kind in ("namedtuple", "typeddict", "dataclass"):
        for stmt in class_node.body:
            if isinstance(stmt, ast.AnnAssign) and isinstance(stmt.target, ast.Name):
                if stmt.target.id == old_name:
                    # Already handled in step 3
                    pass

# Deduplicate edits (same position can appear from multiple passes)
unique_edits = list(set(edits))

# Sort edits in reverse order to apply without shifting positions
unique_edits.sort(key=lambda e: (e[0], e[1]), reverse=True)

# Apply edits
for line_idx, col_start, col_end, replacement in unique_edits:
    line = lines[line_idx]
    lines[line_idx] = line[:col_start] + replacement + line[col_end:]

new_source = "".join(lines)
edit_count = len(unique_edits)

print(json.dumps({
    "success": True,
    "newSource": new_source,
    "editCount": edit_count,
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
      editCount?: number;
      error?: string;
    };

    if (!parsed.success) {
      return {
        success: false,
        newSource: "",
        editCount: 0,
        error: parsed.error ?? "Unknown error",
      };
    }

    return {
      success: true,
      newSource: parsed.newSource ?? source,
      editCount: parsed.editCount ?? 0,
      error: "",
    };
  } catch (err) {
    return {
      success: false,
      newSource: "",
      editCount: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function hasClassDef(
  node: {
    type: string;
    text: string;
    childCount: number;
    child: (i: number) => typeof node | null;
  },
  name: string,
): boolean {
  if (node.type === "class_definition") {
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child && child.type === "identifier" && child.text === name) {
        return true;
      }
    }
  }
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child && hasClassDef(child, name)) return true;
  }
  return false;
}
