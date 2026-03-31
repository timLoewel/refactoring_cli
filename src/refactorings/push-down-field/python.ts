import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import type { PreconditionResult, RefactoringResult } from "../../core/refactoring.types.js";
import { definePythonRefactoring, pythonParam } from "../../python/python-refactoring-builder.js";
import type { PythonProjectContext } from "../../python/python-refactoring-builder.js";

export const pushDownFieldPython = definePythonRefactoring({
  name: "Push Down Field (Python)",
  kebabName: "push-down-field-python",
  tier: 4,
  description:
    "Moves a field from a superclass down to a specific subclass that is the sole user of that field.",
  params: [
    pythonParam.file(),
    pythonParam.identifier("target", "Name of the superclass containing the field"),
    pythonParam.identifier("field", "Name of the field to push down"),
    pythonParam.identifier("subclass", "Name of the subclass to receive the field"),
  ],
  preconditions(ctx: PythonProjectContext, params: Record<string, unknown>): PreconditionResult {
    const errors: string[] = [];
    const file = params["file"] as string;
    const target = params["target"] as string;
    const field = params["field"] as string;
    const subclass = params["subclass"] as string;

    const filePath = path.resolve(ctx.projectRoot, file);
    let source: string;
    try {
      source = readFileSync(filePath, "utf-8");
    } catch {
      errors.push(`File not found: ${file}`);
      return { ok: false, errors };
    }

    const result = validatePushDownField(source, target, field, subclass);
    if (!result.valid) {
      errors.push(...result.errors);
    }

    return { ok: errors.length === 0, errors };
  },
  apply(ctx: PythonProjectContext, params: Record<string, unknown>): RefactoringResult {
    const file = params["file"] as string;
    const target = params["target"] as string;
    const field = params["field"] as string;
    const subclass = params["subclass"] as string;

    const filePath = path.resolve(ctx.projectRoot, file);
    let source: string;
    try {
      source = readFileSync(filePath, "utf-8");
    } catch {
      return { success: false, filesChanged: [], description: `File not found: ${file}` };
    }

    const result = applyPushDownField(source, target, field, subclass);
    if (!result.success) {
      return { success: false, filesChanged: [], description: result.error };
    }

    writeFileSync(filePath, result.newSource, "utf-8");
    return {
      success: true,
      filesChanged: [file],
      description: `Pushed field '${field}' down from '${target}' to '${subclass}'`,
    };
  },
});

interface ValidateResult {
  valid: boolean;
  errors: string[];
}

function validatePushDownField(
  source: string,
  target: string,
  field: string,
  subclass: string,
): ValidateResult {
  const targetJ = JSON.stringify(target);
  const fieldJ = JSON.stringify(field);
  const subclassJ = JSON.stringify(subclass);

  const script = `
import ast, sys, json
source = sys.stdin.read()
target = ${targetJ}
field = ${fieldJ}
subclass = ${subclassJ}

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

if subclass not in all_classes:
    errors.append(f"Class '{subclass}' not found")
else:
    sub_cls = all_classes[subclass]
    extends_target = any(
        (isinstance(b, ast.Name) and b.id == target) or
        (isinstance(b, ast.Attribute) and b.attr == target)
        for b in sub_cls.bases
    )
    if not extends_target:
        errors.append(f"Class '{subclass}' does not extend '{target}'")
    else:
        field_in_sub = find_class_attr(sub_cls, field) or find_init_attr(sub_cls, field) or find_slots_field(sub_cls, field)
        if field_in_sub:
            errors.append(f"Field '{field}' already exists in subclass '{subclass}'")

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

function applyPushDownField(
  source: string,
  target: string,
  field: string,
  subclass: string,
): ApplyResult {
  const targetJ = JSON.stringify(target);
  const fieldJ = JSON.stringify(field);
  const subclassJ = JSON.stringify(subclass);

  const script = `
import ast, sys, json
source = sys.stdin.read()
target = ${targetJ}
field = ${fieldJ}
subclass = ${subclassJ}

tree = ast.parse(source)
lines = source.splitlines(True)

all_classes = {}
for node in ast.walk(tree):
    if isinstance(node, ast.ClassDef):
        all_classes[node.name] = node

target_cls = all_classes[target]
sub_cls = all_classes[subclass]

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
    if cls.body:
        first = cls.body[0]
        if hasattr(first, "col_offset"):
            return first.col_offset
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

# ops: ("replace", line_0idx, new_str) | ("delete", start_0idx, end_0idx_excl) | ("insert", at_0idx, lines_list)
ops = []

target_slots = find_slots_node(target_cls)
class_attr = find_class_attr(target_cls, field)
init_attr, _ = find_init_attr(target_cls, field)

if target_slots and field in get_slots_names(target_slots):
    # SLOTS: remove from parent, add to subclass
    parent_new = [n for n in get_slots_names(target_slots) if n != field]
    ops.append(("replace", target_slots.lineno - 1, build_slots_line(target_slots.col_offset, parent_new)))

    sub_slots = find_slots_node(sub_cls)
    if sub_slots:
        sub_new = get_slots_names(sub_slots) + [field]
        ops.append(("replace", sub_slots.lineno - 1, build_slots_line(sub_slots.col_offset, sub_new)))
    else:
        indent_n = get_body_indent(sub_cls)
        slot_line = build_slots_line(indent_n, [field])
        ops.append(("insert", sub_cls.body[0].lineno - 1, [slot_line]))

elif class_attr is not None:
    # CLASS ATTR: remove from parent class body, insert in subclass class body
    src_indent = class_attr.col_offset
    dst_indent = get_body_indent(sub_cls)
    field_lines = lines[class_attr.lineno - 1:class_attr.end_lineno]
    re_indented = reindent_lines(field_lines, src_indent, dst_indent)

    ops.append(("delete", class_attr.lineno - 1, class_attr.end_lineno))
    ops.append(("insert", sub_cls.end_lineno, ["\\n"] + re_indented))

elif init_attr is not None:
    # INIT ATTR: remove from parent __init__, insert in subclass __init__
    sub_init = find_init(sub_cls)
    if sub_init is None:
        print(json.dumps({"success": False, "newSource": "", "error": f"Subclass '{subclass}' has no __init__ method"}))
        sys.exit(0)

    src_indent = init_attr.col_offset
    dst_indent = sub_init.body[0].col_offset if sub_init.body else src_indent
    field_lines = lines[init_attr.lineno - 1:init_attr.end_lineno]
    re_indented = reindent_lines(field_lines, src_indent, dst_indent)

    ops.append(("delete", init_attr.lineno - 1, init_attr.end_lineno))
    ops.append(("insert", sub_init.end_lineno, re_indented))

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
