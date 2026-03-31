import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import type { PreconditionResult, RefactoringResult } from "../../core/refactoring.types.js";
import { definePythonRefactoring, pythonParam } from "../../python/python-refactoring-builder.js";
import type { PythonProjectContext } from "../../python/python-refactoring-builder.js";

export const pullUpMethodPython = definePythonRefactoring({
  name: "Pull Up Method (Python)",
  kebabName: "pull-up-method-python",
  tier: 4,
  description:
    "Moves a method from a subclass to its superclass, making it available to all siblings.",
  params: [
    pythonParam.file(),
    pythonParam.identifier("target", "Name of the subclass containing the method"),
    pythonParam.identifier("method", "Name of the method to move to the superclass"),
  ],
  preconditions(ctx: PythonProjectContext, params: Record<string, unknown>): PreconditionResult {
    const errors: string[] = [];
    const file = params["file"] as string;
    const target = params["target"] as string;
    const method = params["method"] as string;

    const filePath = path.resolve(ctx.projectRoot, file);
    let source: string;
    try {
      source = readFileSync(filePath, "utf-8");
    } catch {
      errors.push(`File not found: ${file}`);
      return { ok: false, errors };
    }

    const result = validatePullUp(source, target, method);
    if (!result.valid) {
      errors.push(...result.errors);
    }

    return { ok: errors.length === 0, errors };
  },
  apply(ctx: PythonProjectContext, params: Record<string, unknown>): RefactoringResult {
    const file = params["file"] as string;
    const target = params["target"] as string;
    const method = params["method"] as string;

    const filePath = path.resolve(ctx.projectRoot, file);
    let source: string;
    try {
      source = readFileSync(filePath, "utf-8");
    } catch {
      return { success: false, filesChanged: [], description: `File not found: ${file}` };
    }

    const result = applyPullUp(source, target, method);
    if (!result.success) {
      return { success: false, filesChanged: [], description: result.error };
    }

    writeFileSync(filePath, result.newSource, "utf-8");
    return {
      success: true,
      filesChanged: [file],
      description: `Pulled method '${method}' up from '${target}' to parent class`,
    };
  },
});

interface ValidateResult {
  valid: boolean;
  errors: string[];
}

function validatePullUp(source: string, target: string, method: string): ValidateResult {
  const script = `
import ast
import sys
import json

source = sys.stdin.read()
target = ${JSON.stringify(target)}
method = ${JSON.stringify(method)}

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
    print(json.dumps({"valid": len(errors) == 0, "errors": errors}))
    sys.exit(0)

parent_cls = all_classes.get(parent_name)
if parent_cls is None:
    errors.append(f"Parent class '{parent_name}' not found in file")
    print(json.dumps({"valid": len(errors) == 0, "errors": errors}))
    sys.exit(0)

method_found = False
for node in ast.iter_child_nodes(target_cls):
    if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name == method:
        method_found = True
        break

if not method_found:
    errors.append(f"Method '{method}' not found in class '{target}'")

for node in ast.iter_child_nodes(parent_cls):
    if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name == method:
        errors.append(f"Method '{method}' already exists in parent class '{parent_name}'")
        break

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

function applyPullUp(source: string, target: string, method: string): ApplyResult {
  const script = `
import ast
import sys
import json

source = sys.stdin.read()
target = ${JSON.stringify(target)}
method = ${JSON.stringify(method)}

tree = ast.parse(source)
lines = source.splitlines(True)

all_classes = {}
for node in ast.walk(tree):
    if isinstance(node, ast.ClassDef):
        all_classes[node.name] = node

target_cls = all_classes[target]

parent_name = None
for base in target_cls.bases:
    if isinstance(base, ast.Name):
        parent_name = base.id
        break
    elif isinstance(base, ast.Attribute):
        parent_name = base.attr
        break

parent_cls = all_classes[parent_name]

# Find the method in target class
target_method = None
for node in ast.iter_child_nodes(target_cls):
    if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name == method:
        target_method = node
        break

# Compute method line range (0-indexed, including decorators)
method_first = target_method.lineno - 1
if target_method.decorator_list:
    method_first = target_method.decorator_list[0].lineno - 1
method_last = target_method.end_lineno  # exclusive end (0-indexed)

method_lines = lines[method_first:method_last]

# Determine indentation: target method's col_offset gives method-level indent
target_indent_len = target_method.col_offset

# Determine parent class body indent from first member, fallback to 4
parent_indent_len = 4
for node in ast.iter_child_nodes(parent_cls):
    if hasattr(node, "col_offset"):
        parent_indent_len = node.col_offset
        break

parent_body_indent = " " * parent_indent_len

# Re-indent method lines from target_indent to parent_body_indent
re_indented = []
for line in method_lines:
    stripped = line.lstrip()
    if not stripped or stripped == "\\n":
        re_indented.append("\\n")
    else:
        current_spaces = len(line) - len(line.lstrip())
        extra = current_spaces - target_indent_len
        new_line = parent_body_indent + " " * max(0, extra) + stripped
        if not new_line.endswith("\\n"):
            new_line += "\\n"
        re_indented.append(new_line)

def normalize_method(ll):
    """Strip leading whitespace for comparison."""
    return [ln.strip() for ln in ll if ln.strip()]

target_normalized = normalize_method(method_lines)

# Find sibling classes (same parent) that have identical method
siblings_to_clean = []
for cls_name, cls_node in all_classes.items():
    if cls_name == target or cls_name == parent_name:
        continue
    # Check if this class directly extends parent_name
    has_parent = False
    for base in cls_node.bases:
        base_name = base.id if isinstance(base, ast.Name) else (base.attr if isinstance(base, ast.Attribute) else None)
        if base_name == parent_name:
            has_parent = True
            break
    if not has_parent:
        continue
    # Find same method in sibling
    for sib_node in ast.iter_child_nodes(cls_node):
        if not isinstance(sib_node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            continue
        if sib_node.name != method:
            continue
        sib_first = sib_node.lineno - 1
        if sib_node.decorator_list:
            sib_first = sib_node.decorator_list[0].lineno - 1
        sib_last = sib_node.end_lineno
        sib_lines = lines[sib_first:sib_last]
        if normalize_method(sib_lines) == target_normalized:
            siblings_to_clean.append((sib_first, sib_last))
        break

# Build operations: deletions + one insertion
# Insert point: end of parent class body (1-indexed end_lineno = 0-indexed insert position)
insert_at = parent_cls.end_lineno  # insert AFTER last line of parent class

ops = []
ops.append(("delete", method_first, method_last))
for sib_first, sib_last in siblings_to_clean:
    ops.append(("delete", sib_first, sib_last))
ops.append(("insert", insert_at, ["\\n"] + re_indented))

# Sort descending by line number so higher-line edits don't shift lower ones
ops.sort(key=lambda op: op[1], reverse=True)

new_lines = list(lines)
for op in ops:
    if op[0] == "delete":
        _, start, end = op
        del new_lines[start:end]
    elif op[0] == "insert":
        _, at, data = op
        new_lines[at:at] = data

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
