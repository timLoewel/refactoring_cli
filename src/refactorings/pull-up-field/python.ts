import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import type { PreconditionResult, RefactoringResult } from "../../core/refactoring.types.js";
import { definePythonRefactoring, pythonParam } from "../../python/python-refactoring-builder.js";
import type { PythonProjectContext } from "../../python/python-refactoring-builder.js";

export const pullUpFieldPython = definePythonRefactoring({
  name: "Pull Up Field (Python)",
  kebabName: "pull-up-field-python",
  tier: 4,
  description:
    "Moves a field from a subclass to its superclass, making it available to all siblings.",
  params: [
    pythonParam.file(),
    pythonParam.identifier("target", "Name of the subclass containing the field"),
    pythonParam.identifier("field", "Name of the field to move to the superclass"),
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

    const result = validatePullUpField(source, target, field);
    if (!result.valid) {
      errors.push(...result.errors);
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

    const result = applyPullUpField(source, target, field);
    if (!result.success) {
      return { success: false, filesChanged: [], description: result.error };
    }

    writeFileSync(filePath, result.newSource, "utf-8");
    return {
      success: true,
      filesChanged: [file],
      description: `Pulled field '${field}' up from '${target}' to parent class`,
    };
  },
});

interface ValidateResult {
  valid: boolean;
  errors: string[];
}

function validatePullUpField(source: string, target: string, field: string): ValidateResult {
  const script = `
import ast
import sys
import json

source = sys.stdin.read()
target = ${JSON.stringify(target)}
field = ${JSON.stringify(field)}

tree = ast.parse(source)
errors = []

all_classes = {}
for node in ast.walk(tree):
    if isinstance(node, ast.ClassDef):
        all_classes[node.name] = node

if target not in all_classes:
    print(json.dumps({"valid": False, "errors": [f"Class '{target}' not found"]}))
    sys.exit(0)

target_cls = all_classes[target]

parent_name = None
for base in target_cls.bases:
    if isinstance(base, ast.Name):
        parent_name = base.id
        break
    elif isinstance(base, ast.Attribute):
        parent_name = base.attr
        break

if parent_name is None:
    errors.append(f"Class '{target}' has no base class")
    print(json.dumps({"valid": False, "errors": errors}))
    sys.exit(0)

parent_cls = all_classes.get(parent_name)
if parent_cls is None:
    errors.append(f"Parent class '{parent_name}' not found in file")
    print(json.dumps({"valid": False, "errors": errors}))
    sys.exit(0)

def find_class_attr(cls, name):
    for node in ast.iter_child_nodes(cls):
        if isinstance(node, ast.AnnAssign) and isinstance(node.target, ast.Name) and node.target.id == name:
            return True
        if isinstance(node, ast.Assign):
            for tgt in node.targets:
                if isinstance(tgt, ast.Name) and tgt.id == name:
                    return True
    return False

def find_init_attr(cls, name):
    for child in ast.iter_child_nodes(cls):
        if isinstance(child, ast.FunctionDef) and child.name == "__init__":
            for stmt in child.body:
                if isinstance(stmt, ast.Assign):
                    for tgt in stmt.targets:
                        if isinstance(tgt, ast.Attribute) and isinstance(tgt.value, ast.Name) and tgt.value.id == "self" and tgt.attr == name:
                            return True
                elif isinstance(stmt, ast.AnnAssign):
                    tgt = stmt.target
                    if isinstance(tgt, ast.Attribute) and isinstance(tgt.value, ast.Name) and tgt.value.id == "self" and tgt.attr == name:
                        return True
    return False

def find_slots_field(cls, name):
    for node in ast.iter_child_nodes(cls):
        if isinstance(node, ast.Assign):
            for tgt in node.targets:
                if isinstance(tgt, ast.Name) and tgt.id == "__slots__":
                    val = node.value
                    if isinstance(val, (ast.Tuple, ast.List)):
                        for elt in val.elts:
                            if isinstance(elt, ast.Constant) and elt.value == name:
                                return True
        elif isinstance(node, ast.AnnAssign):
            if isinstance(node.target, ast.Name) and node.target.id == "__slots__":
                val = getattr(node, 'value', None)
                if val and isinstance(val, (ast.Tuple, ast.List)):
                    for elt in val.elts:
                        if isinstance(elt, ast.Constant) and elt.value == name:
                            return True
    return False

field_in_target = find_class_attr(target_cls, field) or find_init_attr(target_cls, field) or find_slots_field(target_cls, field)
if not field_in_target:
    errors.append(f"Field '{field}' not found in class '{target}'")

field_in_parent = find_class_attr(parent_cls, field) or find_init_attr(parent_cls, field) or find_slots_field(parent_cls, field)
if field_in_parent:
    errors.append(f"Field '{field}' already exists in parent class '{parent_name}'")

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

interface ApplyResult {
  success: boolean;
  newSource: string;
  error: string;
}

function applyPullUpField(source: string, target: string, field: string): ApplyResult {
  const script = `
import ast
import sys
import json

source = sys.stdin.read()
target = ${JSON.stringify(target)}
field = ${JSON.stringify(field)}

tree = ast.parse(source)
lines = source.splitlines(True)

all_classes = {}
for node in ast.walk(tree):
    if isinstance(node, ast.ClassDef):
        all_classes[node.name] = node

def get_parent_name(cls):
    for base in cls.bases:
        if isinstance(base, ast.Name):
            return base.id
        elif isinstance(base, ast.Attribute):
            return base.attr
    return None

def find_class_attr(cls, name):
    for node in ast.iter_child_nodes(cls):
        if isinstance(node, ast.AnnAssign) and isinstance(node.target, ast.Name) and node.target.id == name:
            return node
        if isinstance(node, ast.Assign):
            for tgt in node.targets:
                if isinstance(tgt, ast.Name) and tgt.id == name:
                    return node
    return None

def find_init_attr(cls, name):
    for child in ast.iter_child_nodes(cls):
        if isinstance(child, ast.FunctionDef) and child.name == "__init__":
            for stmt in child.body:
                if isinstance(stmt, ast.Assign):
                    for tgt in stmt.targets:
                        if (isinstance(tgt, ast.Attribute) and
                                isinstance(tgt.value, ast.Name) and
                                tgt.value.id == "self" and
                                tgt.attr == name):
                            return stmt, child
                elif isinstance(stmt, ast.AnnAssign):
                    tgt = stmt.target
                    if (isinstance(tgt, ast.Attribute) and
                            isinstance(tgt.value, ast.Name) and
                            tgt.value.id == "self" and
                            tgt.attr == name):
                        return stmt, child
    return None, None

def find_init(cls):
    for child in ast.iter_child_nodes(cls):
        if isinstance(child, ast.FunctionDef) and child.name == "__init__":
            return child
    return None

def find_slots_node(cls):
    for node in ast.iter_child_nodes(cls):
        if isinstance(node, ast.Assign):
            for tgt in node.targets:
                if isinstance(tgt, ast.Name) and tgt.id == "__slots__":
                    return node
        elif isinstance(node, ast.AnnAssign):
            if isinstance(node.target, ast.Name) and node.target.id == "__slots__":
                return node
    return None

def get_slots_names(sn):
    val = sn.value if isinstance(sn, ast.Assign) else getattr(sn, 'value', None)
    if val and isinstance(val, (ast.Tuple, ast.List)):
        return [e.value for e in val.elts if isinstance(e, ast.Constant)]
    return []

def build_slots_line(indent_n, names):
    indent = " " * indent_n
    if not names:
        return indent + "__slots__ = ()\\n"
    elif len(names) == 1:
        return indent + "__slots__ = (" + repr(names[0]) + ",)\\n"
    return indent + "__slots__ = (" + ", ".join(repr(n) for n in names) + ")\\n"

def get_body_indent(cls):
    for node in ast.iter_child_nodes(cls):
        if hasattr(node, "col_offset"):
            return node.col_offset
    return 4

def reindent_lines(text_lines, src_indent, dst_indent):
    result = []
    for line in text_lines:
        stripped = line.lstrip()
        if not stripped or stripped == "\\n":
            result.append("\\n")
        else:
            current = len(line) - len(stripped)
            extra = current - src_indent
            new_line = " " * (dst_indent + max(0, extra)) + stripped
            if not new_line.endswith("\\n"):
                new_line += "\\n"
            result.append(new_line)
    return result

def get_siblings(parent_name):
    result = []
    for cls_name, cls_node in all_classes.items():
        if cls_name == target or cls_name == parent_name:
            continue
        for base in cls_node.bases:
            bname = base.id if isinstance(base, ast.Name) else (base.attr if isinstance(base, ast.Attribute) else None)
            if bname == parent_name:
                result.append(cls_node)
                break
    return result

target_cls = all_classes[target]
parent_name = get_parent_name(target_cls)
parent_cls = all_classes[parent_name]
siblings = get_siblings(parent_name)

# ops: ("replace", line_0idx, new_str) | ("delete", start_0idx, end_0idx_excl) | ("insert", at_0idx, lines_list)
ops = []

target_slots = find_slots_node(target_cls)
class_attr = find_class_attr(target_cls, field)
init_attr, _ = find_init_attr(target_cls, field)

if target_slots and field in get_slots_names(target_slots):
    # SLOTS: remove from target, add to parent, clean siblings
    new_names = [n for n in get_slots_names(target_slots) if n != field]
    ops.append(("replace", target_slots.lineno - 1, build_slots_line(target_slots.col_offset, new_names)))

    for sib in siblings:
        sib_slots = find_slots_node(sib)
        if sib_slots and field in get_slots_names(sib_slots):
            new_sib = [n for n in get_slots_names(sib_slots) if n != field]
            ops.append(("replace", sib_slots.lineno - 1, build_slots_line(sib_slots.col_offset, new_sib)))

    parent_slots = find_slots_node(parent_cls)
    if parent_slots:
        parent_new = get_slots_names(parent_slots) + [field]
        ops.append(("replace", parent_slots.lineno - 1, build_slots_line(parent_slots.col_offset, parent_new)))
    else:
        indent_n = get_body_indent(parent_cls)
        slot_line = build_slots_line(indent_n, [field])
        ops.append(("insert", parent_cls.body[0].lineno - 1, [slot_line]))

elif class_attr is not None:
    # CLASS ATTR: remove from target, add to parent class body
    src_indent = class_attr.col_offset
    dst_indent = get_body_indent(parent_cls)
    field_lines = lines[class_attr.lineno - 1:class_attr.end_lineno]
    re_indented = reindent_lines(field_lines, src_indent, dst_indent)

    ops.append(("delete", class_attr.lineno - 1, class_attr.end_lineno))
    ops.append(("insert", parent_cls.end_lineno, ["\\n"] + re_indented))

    for sib in siblings:
        sib_attr = find_class_attr(sib, field)
        if sib_attr is not None:
            ops.append(("delete", sib_attr.lineno - 1, sib_attr.end_lineno))

elif init_attr is not None:
    # INIT ATTR: remove from target __init__, add to parent __init__
    parent_init = find_init(parent_cls)
    if parent_init is None:
        print(json.dumps({"success": False, "newSource": "", "error": f"Parent '{parent_name}' has no __init__ method"}))
        sys.exit(0)

    src_indent = init_attr.col_offset
    dst_indent = parent_init.body[0].col_offset if parent_init.body else src_indent
    field_lines = lines[init_attr.lineno - 1:init_attr.end_lineno]
    re_indented = reindent_lines(field_lines, src_indent, dst_indent)

    ops.append(("delete", init_attr.lineno - 1, init_attr.end_lineno))
    ops.append(("insert", parent_init.end_lineno, re_indented))

    for sib in siblings:
        sib_stmt, _ = find_init_attr(sib, field)
        if sib_stmt is not None:
            ops.append(("delete", sib_stmt.lineno - 1, sib_stmt.end_lineno))

else:
    print(json.dumps({"success": False, "newSource": "", "error": f"Field '{field}' not found in class '{target}'"}))
    sys.exit(0)

ops.sort(key=lambda op: op[1], reverse=True)

new_lines = list(lines)
for op in ops:
    if op[0] == "replace":
        new_lines[op[1]] = op[2]
    elif op[0] == "insert":
        new_lines[op[1]:op[1]] = op[2]
    elif op[0] == "delete":
        del new_lines[op[1]:op[2]]

new_source = "".join(new_lines)

try:
    ast.parse(new_source)
except SyntaxError as e:
    print(json.dumps({"success": False, "newSource": "", "error": f"Generated invalid Python: {e}"}))
    sys.exit(0)

print(json.dumps({"success": True, "newSource": new_source, "error": ""}))
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
