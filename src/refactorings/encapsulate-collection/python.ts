import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import type { PreconditionResult, RefactoringResult } from "../../core/refactoring.types.js";
import { definePythonRefactoring, pythonParam } from "../../python/python-refactoring-builder.js";
import type { PythonProjectContext } from "../../python/python-refactoring-builder.js";

export const encapsulateCollectionPython = definePythonRefactoring({
  name: "Encapsulate Collection (Python)",
  kebabName: "encapsulate-collection-python",
  tier: 3,
  description:
    "Replaces direct access to a collection attribute with add, remove, and get methods that control mutation.",
  params: [
    pythonParam.file(),
    pythonParam.identifier("target", "Name of the class containing the collection attribute"),
    pythonParam.identifier("field", "Name of the collection attribute to encapsulate"),
  ],
  preconditions(ctx: PythonProjectContext, params: Record<string, unknown>): PreconditionResult {
    const errors: string[] = [];
    const file = params["file"] as string;
    const target = params["target"] as string;
    const field = params["field"] as string;

    const filePath = path.resolve(ctx.projectRoot, file);
    let source: string;
    try {
      source = readFileSync(filePath, "utf-8");
    } catch {
      errors.push(`File not found: ${file}`);
      return { ok: false, errors };
    }

    const result = validateTarget(source, target, field);
    if (!result.valid) {
      errors.push(result.error);
    }

    return { ok: errors.length === 0, errors };
  },
  apply(ctx: PythonProjectContext, params: Record<string, unknown>): RefactoringResult {
    const file = params["file"] as string;
    const target = params["target"] as string;
    const field = params["field"] as string;

    const filePath = path.resolve(ctx.projectRoot, file);

    let source: string;
    try {
      source = readFileSync(filePath, "utf-8");
    } catch {
      return { success: false, filesChanged: [], description: `File not found: ${file}` };
    }

    const result = transformCollection(source, target, field);

    if (!result.success) {
      return { success: false, filesChanged: [], description: result.error };
    }

    writeFileSync(filePath, result.newSource, "utf-8");

    return {
      success: true,
      filesChanged: [file],
      description: `Encapsulated collection '${field}' on '${target}' with add/remove/get methods`,
    };
  },
});

interface ValidateResult {
  valid: boolean;
  error: string;
}

function validateTarget(source: string, target: string, field: string): ValidateResult {
  const script = `
import ast, sys, json

source = sys.stdin.read()
target = ${JSON.stringify(target)}
field = ${JSON.stringify(field)}
tree = ast.parse(source)

found_class = False
found_field = False

for node in ast.iter_child_nodes(tree):
    if isinstance(node, ast.ClassDef) and node.name == target:
        found_class = True
        for stmt in ast.walk(node):
            if isinstance(stmt, ast.Assign):
                for t in stmt.targets:
                    if isinstance(t, ast.Attribute) and t.attr == field:
                        found_field = True
            if isinstance(stmt, ast.AnnAssign):
                if isinstance(stmt.target, ast.Attribute) and stmt.target.attr == field:
                    found_field = True

if not found_class:
    print(json.dumps({"valid": False, "error": f"Class '{target}' not found"}))
elif not found_field:
    print(json.dumps({"valid": False, "error": f"Field '{field}' not found on class '{target}'"}))
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

function transformCollection(source: string, target: string, field: string): TransformResult {
  const script = `
import ast, sys, json, re

source = sys.stdin.read()
target = ${JSON.stringify(target)}
field = ${JSON.stringify(field)}
tree = ast.parse(source)
lines = source.splitlines(True)

# --- Phase 1: Find the class and field ---

class_node = None
field_type = None

for node in ast.iter_child_nodes(tree):
    if isinstance(node, ast.ClassDef) and node.name == target:
        class_node = node
        break

if not class_node:
    print(json.dumps({"success": False, "error": f"Class '{target}' not found", "newSource": ""}))
    sys.exit(0)

for stmt in ast.walk(class_node):
    if isinstance(stmt, ast.AnnAssign):
        if isinstance(stmt.target, ast.Attribute) and stmt.target.attr == field:
            field_type = ast.get_source_segment(source, stmt.annotation)

# --- Phase 2: Determine element type from annotation ---

element_type = None
if field_type:
    m = re.match(r'(?:list|List|set|Set)\\[(.+)\\]', field_type)
    if m:
        element_type = m.group(1)

# --- Phase 3: Build accessor methods ---

body_indent = "    "
if class_node.body:
    first_body = class_node.body[0]
    first_line = lines[first_body.lineno - 1]
    body_indent = first_line[:len(first_line) - len(first_line.lstrip())]

if element_type:
    get_sig = f"def get_{field}(self) -> list[{element_type}]:"
    add_sig = f"def add_{field}(self, item: {element_type}) -> None:"
    remove_sig = f"def remove_{field}(self, item: {element_type}) -> None:"
else:
    get_sig = f"def get_{field}(self):"
    add_sig = f"def add_{field}(self, item) -> None:"
    remove_sig = f"def remove_{field}(self, item) -> None:"

methods_text = (
    f"\\n"
    f"{body_indent}{get_sig}\\n"
    f"{body_indent}    return list(self._{field})\\n"
    f"\\n"
    f"{body_indent}{add_sig}\\n"
    f"{body_indent}    self._{field}.append(item)\\n"
    f"\\n"
    f"{body_indent}{remove_sig}\\n"
    f"{body_indent}    self._{field}.remove(item)\\n"
)

# --- Phase 4: Collect node IDs inside the class ---

class_node_ids = set()
for n in ast.walk(class_node):
    class_node_ids.add(id(n))

def is_in_class(node):
    return id(node) in class_node_ids

# --- Phase 5: Collect all edits ---

edits = []

# 5a: Rename self.field -> self._field inside the class
for node in ast.walk(class_node):
    if isinstance(node, ast.Attribute) and node.attr == field:
        if isinstance(node.value, ast.Name) and node.value.id == "self":
            line_idx = node.end_lineno - 1
            end_col = node.end_col_offset
            start_col = end_col - len(field)
            edits.append({
                "line": line_idx,
                "col": start_col,
                "end_line": line_idx,
                "end_col": end_col,
                "replacement": "_" + field,
                "priority": 0,
            })

# 5b: Rewrite external accesses (outside the class)

for node in ast.walk(tree):
    if is_in_class(node):
        continue

    # Pattern: obj.field.append(x) -> obj.add_field(x)
    # Pattern: obj.field.remove(x) -> obj.remove_field(x)
    if isinstance(node, ast.Call):
        if isinstance(node.func, ast.Attribute):
            method = node.func.attr
            if isinstance(node.func.value, ast.Attribute) and node.func.value.attr == field:
                obj_node = node.func.value.value
                obj_text = ast.get_source_segment(source, obj_node)
                if obj_text and method == "append" and len(node.args) >= 1:
                    arg_text = ast.get_source_segment(source, node.args[0])
                    if arg_text:
                        edits.append({
                            "line": node.lineno - 1,
                            "col": node.col_offset,
                            "end_line": node.end_lineno - 1,
                            "end_col": node.end_col_offset,
                            "replacement": f"{obj_text}.add_{field}({arg_text})",
                            "priority": 1,
                        })
                        continue
                if obj_text and method == "remove" and len(node.args) >= 1:
                    arg_text = ast.get_source_segment(source, node.args[0])
                    if arg_text:
                        edits.append({
                            "line": node.lineno - 1,
                            "col": node.col_offset,
                            "end_line": node.end_lineno - 1,
                            "end_col": node.end_col_offset,
                            "replacement": f"{obj_text}.remove_{field}({arg_text})",
                            "priority": 1,
                        })
                        continue

        # Pattern: len(obj.field) -> len(obj.get_field())
        if isinstance(node.func, ast.Name) and node.func.id in ("len", "sorted", "reversed", "tuple", "list", "set", "frozenset"):
            if len(node.args) == 1:
                arg = node.args[0]
                if isinstance(arg, ast.Attribute) and arg.attr == field:
                    obj_text = ast.get_source_segment(source, arg.value)
                    if obj_text:
                        edits.append({
                            "line": node.lineno - 1,
                            "col": node.col_offset,
                            "end_line": node.end_lineno - 1,
                            "end_col": node.end_col_offset,
                            "replacement": f"{node.func.id}({obj_text}.get_{field}())",
                            "priority": 1,
                        })
                        continue

# 5c: Replace remaining obj.field reads outside the class
for node in ast.walk(tree):
    if is_in_class(node):
        continue
    if not isinstance(node, ast.Attribute) or node.attr != field:
        continue
    if isinstance(node.value, ast.Name) and node.value.id == "self":
        continue
    # Check this isn't already covered by a higher-priority edit
    already_covered = False
    for e in edits:
        if e["priority"] >= 1:
            if e["line"] <= node.lineno - 1 <= e["end_line"]:
                if node.col_offset >= e["col"] and node.end_col_offset <= e["end_col"]:
                    already_covered = True
                    break
    if already_covered:
        continue
    obj_text = ast.get_source_segment(source, node.value)
    if obj_text:
        edits.append({
            "line": node.lineno - 1,
            "col": node.col_offset,
            "end_line": node.end_lineno - 1,
            "end_col": node.end_col_offset,
            "replacement": f"{obj_text}.get_{field}()",
            "priority": 2,
        })

# --- Phase 6: Apply edits ---

edits.sort(key=lambda e: (e["line"], e["col"]), reverse=True)
seen = set()
unique = []
for e in edits:
    k = (e["line"], e["col"], e["end_line"], e["end_col"])
    if k not in seen:
        seen.add(k)
        unique.append(e)
edits = unique

new_lines = list(lines)
for e in edits:
    if e["line"] == e["end_line"]:
        ln = new_lines[e["line"]]
        new_lines[e["line"]] = ln[:e["col"]] + e["replacement"] + ln[e["end_col"]:]
    else:
        first = new_lines[e["line"]]
        last = new_lines[e["end_line"]]
        new_lines[e["line"]] = first[:e["col"]] + e["replacement"] + last[e["end_col"]:]
        del new_lines[e["line"] + 1:e["end_line"] + 1]

# Insert accessor methods at the end of the class body
result_source = "".join(new_lines)
result_tree = ast.parse(result_source)
result_lines = result_source.splitlines(True)

for node in ast.iter_child_nodes(result_tree):
    if isinstance(node, ast.ClassDef) and node.name == target:
        insert_line = node.end_lineno
        result_lines.insert(insert_line, methods_text)
        break

final = "".join(result_lines)
print(json.dumps({"success": True, "newSource": final, "error": ""}))
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
