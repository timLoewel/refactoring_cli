import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import type { PreconditionResult, RefactoringResult } from "../../core/refactoring.types.js";
import { definePythonRefactoring, pythonParam } from "../../python/python-refactoring-builder.js";
import type { PythonProjectContext } from "../../python/python-refactoring-builder.js";

export const pushDownMethodPython = definePythonRefactoring({
  name: "Push Down Method (Python)",
  kebabName: "push-down-method-python",
  tier: 4,
  description:
    "Moves a method from a superclass down to a specific subclass that is the only relevant consumer.",
  params: [
    pythonParam.file(),
    pythonParam.identifier("target", "Name of the superclass containing the method"),
    pythonParam.identifier("method", "Name of the method to push down"),
    pythonParam.identifier("subclass", "Name of the subclass to receive the method"),
  ],
  preconditions(ctx: PythonProjectContext, params: Record<string, unknown>): PreconditionResult {
    const errors: string[] = [];
    const file = params["file"] as string;
    const target = params["target"] as string;
    const method = params["method"] as string;
    const subclass = params["subclass"] as string;

    const filePath = path.resolve(ctx.projectRoot, file);
    let source: string;
    try {
      source = readFileSync(filePath, "utf-8");
    } catch {
      errors.push(`File not found: ${file}`);
      return { ok: false, errors };
    }

    const result = validatePushDown(source, target, method, subclass);
    if (!result.valid) {
      errors.push(...result.errors);
    }

    return { ok: errors.length === 0, errors };
  },
  apply(ctx: PythonProjectContext, params: Record<string, unknown>): RefactoringResult {
    const file = params["file"] as string;
    const target = params["target"] as string;
    const method = params["method"] as string;
    const subclass = params["subclass"] as string;

    const filePath = path.resolve(ctx.projectRoot, file);
    let source: string;
    try {
      source = readFileSync(filePath, "utf-8");
    } catch {
      return { success: false, filesChanged: [], description: `File not found: ${file}` };
    }

    const result = applyPushDown(source, target, method, subclass);
    if (!result.success) {
      return { success: false, filesChanged: [], description: result.error };
    }

    writeFileSync(filePath, result.newSource, "utf-8");
    return {
      success: true,
      filesChanged: [file],
      description: `Pushed method '${method}' down from '${target}' to '${subclass}'`,
    };
  },
});

interface ValidateResult {
  valid: boolean;
  errors: string[];
}

function validatePushDown(
  source: string,
  target: string,
  method: string,
  subclass: string,
): ValidateResult {
  const targetJ = JSON.stringify(target);
  const methodJ = JSON.stringify(method);
  const subclassJ = JSON.stringify(subclass);

  const script = `
import ast, sys, json
source = sys.stdin.read()
target = ${targetJ}
method = ${methodJ}
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
method_found = False
for node in ast.iter_child_nodes(target_cls):
    if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name == method:
        method_found = True
        break
if not method_found:
    errors.append(f"Method '{method}' not found in class '{target}'")

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
        for node in ast.iter_child_nodes(sub_cls):
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name == method:
                errors.append(f"Method '{method}' already exists in subclass '{subclass}'")
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

function applyPushDown(
  source: string,
  target: string,
  method: string,
  subclass: string,
): ApplyResult {
  const targetJ = JSON.stringify(target);
  const methodJ = JSON.stringify(method);
  const subclassJ = JSON.stringify(subclass);

  const script = `
import ast, sys, json
source = sys.stdin.read()
target = ${targetJ}
method = ${methodJ}
subclass = ${subclassJ}

tree = ast.parse(source)
lines = source.splitlines(True)

all_classes = {}
for node in ast.walk(tree):
    if isinstance(node, ast.ClassDef):
        all_classes[node.name] = node

target_cls = all_classes[target]
sub_cls = all_classes[subclass]

# Find the method in the parent class
parent_method = None
for node in ast.iter_child_nodes(target_cls):
    if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name == method:
        parent_method = node
        break

# Method line range in parent (0-indexed, including decorators)
method_first = parent_method.lineno - 1
if parent_method.decorator_list:
    method_first = parent_method.decorator_list[0].lineno - 1
method_last = parent_method.end_lineno  # exclusive end (0-indexed)

method_lines = lines[method_first:method_last]

# Collect @abstractmethod decorator line numbers (0-indexed) to strip from the copy
abstract_dec_lines = set()
for dec in parent_method.decorator_list:
    dec_name = (dec.id if isinstance(dec, ast.Name) else
                dec.attr if isinstance(dec, ast.Attribute) else None)
    if dec_name == "abstractmethod":
        abstract_dec_lines.add(dec.lineno - 1)

# Parent method indentation
parent_indent_len = parent_method.col_offset

# Subclass body indent from first body member, fallback to 4
sub_indent_len = 4
if sub_cls.body:
    first_body = sub_cls.body[0]
    if hasattr(first_body, "col_offset"):
        sub_indent_len = first_body.col_offset

sub_body_indent = " " * sub_indent_len

# Re-indent method lines, skipping @abstractmethod decorator lines
re_indented = []
for idx, line in enumerate(method_lines):
    if (method_first + idx) in abstract_dec_lines:
        continue
    stripped = line.lstrip()
    if not stripped or stripped == "\\n":
        re_indented.append("\\n")
    else:
        current_spaces = len(line) - len(line.lstrip())
        extra = current_spaces - parent_indent_len
        new_line = sub_body_indent + " " * max(0, extra) + stripped
        if not new_line.endswith("\\n"):
            new_line += "\\n"
        re_indented.append(new_line)

# Remove leading blank lines (can appear after stripping @abstractmethod)
while re_indented and re_indented[0].strip() == "":
    re_indented.pop(0)

# Rewrite super().method(...) -> self.method(...) in other subclass methods
new_lines = list(lines)
super_edits = []
for meth in ast.iter_child_nodes(sub_cls):
    if not isinstance(meth, (ast.FunctionDef, ast.AsyncFunctionDef)):
        continue
    if meth.name == method:
        continue
    for node in ast.walk(meth):
        if not isinstance(node, ast.Call):
            continue
        func = node.func
        if not isinstance(func, ast.Attribute) or func.attr != method:
            continue
        if not isinstance(func.value, ast.Call):
            continue
        super_call = func.value
        if not isinstance(super_call.func, ast.Name) or super_call.func.id != "super":
            continue
        # Replace super() with self at exact column positions
        line_idx = super_call.lineno - 1
        super_edits.append((line_idx, super_call.col_offset, super_call.end_col_offset, "self"))

# Apply column-level super rewrites (no line count change)
super_edits.sort(key=lambda e: (e[0], e[1]), reverse=True)
for line_idx, col_start, col_end, replacement in super_edits:
    ln = new_lines[line_idx]
    new_lines[line_idx] = ln[:col_start] + replacement + ln[col_end:]

# Insert at end of subclass, delete from parent
# Sort descending: if sub_cls is below target_cls, insert_at > method_first
# so insert runs first (doesn't affect parent positions), then delete
insert_at = sub_cls.end_lineno
ops = [
    ("delete", method_first, method_last),
    ("insert", insert_at, ["\\n"] + re_indented),
]
ops.sort(key=lambda op: op[1], reverse=True)

for op in ops:
    if op[0] == "delete":
        _, start, end = op
        del new_lines[start:end]
    else:
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
