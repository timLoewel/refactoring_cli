import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import type { PreconditionResult, RefactoringResult } from "../../core/refactoring.types.js";
import { definePythonRefactoring, pythonParam } from "../../python/python-refactoring-builder.js";
import type { PythonProjectContext } from "../../python/python-refactoring-builder.js";

export const replaceSuperclassWithDelegatePython = definePythonRefactoring({
  name: "Replace Superclass with Delegate (Python)",
  kebabName: "replace-superclass-with-delegate-python",
  tier: 4,
  description:
    "Replaces a class's superclass inheritance with a delegate field, forwarding calls through composition instead of inheritance.",
  params: [
    pythonParam.file(),
    pythonParam.identifier("target", "Name of the class that currently inherits from a superclass"),
    pythonParam.identifier(
      "delegateFieldName",
      "Name for the new delegate field that will replace the superclass",
    ),
  ],
  preconditions(ctx: PythonProjectContext, params: Record<string, unknown>): PreconditionResult {
    const errors: string[] = [];
    const file = params["file"] as string;
    const target = params["target"] as string;
    const delegateFieldName = params["delegateFieldName"] as string;

    const filePath = path.resolve(ctx.projectRoot, file);
    let source: string;
    try {
      source = readFileSync(filePath, "utf-8");
    } catch {
      errors.push(`File not found: ${file}`);
      return { ok: false, errors };
    }

    const result = validateReplaceSuperclassWithDelegate(source, target, delegateFieldName);
    if (!result.valid) {
      errors.push(...result.errors);
    }

    return { ok: errors.length === 0, errors };
  },
  apply(ctx: PythonProjectContext, params: Record<string, unknown>): RefactoringResult {
    const file = params["file"] as string;
    const target = params["target"] as string;
    const delegateFieldName = params["delegateFieldName"] as string;

    const filePath = path.resolve(ctx.projectRoot, file);
    let source: string;
    try {
      source = readFileSync(filePath, "utf-8");
    } catch {
      return { success: false, filesChanged: [], description: `File not found: ${file}` };
    }

    const result = applyReplaceSuperclassWithDelegate(source, target, delegateFieldName);
    if (!result.success) {
      return { success: false, filesChanged: [], description: result.error };
    }

    writeFileSync(filePath, result.newSource, "utf-8");

    return {
      success: true,
      filesChanged: [file],
      description: `Replaced superclass inheritance in '${target}' with delegate field '${delegateFieldName}'`,
    };
  },
});

interface ValidateResult {
  valid: boolean;
  errors: string[];
}

function validateReplaceSuperclassWithDelegate(
  source: string,
  target: string,
  delegateFieldName: string,
): ValidateResult {
  const targetJ = JSON.stringify(target);
  const delegateFieldNameJ = JSON.stringify(delegateFieldName);

  const script = `
import ast, sys, json

source = sys.stdin.read()
target = ${targetJ}
delegate_field_name = ${delegateFieldNameJ}

try:
    tree = ast.parse(source)
except SyntaxError as e:
    print(json.dumps({"valid": False, "errors": [f"Syntax error: {e}"]}))
    sys.exit(0)

errors = []
classes = {}
for node in ast.iter_child_nodes(tree):
    if isinstance(node, ast.ClassDef):
        classes[node.name] = node

if target not in classes:
    errors.append(f"Class '{target}' not found")
    print(json.dumps({"valid": False, "errors": errors}))
    sys.exit(0)

target_cls = classes[target]
if not target_cls.bases:
    errors.append(f"Class '{target}' does not extend any class")
    print(json.dumps({"valid": False, "errors": errors}))
    sys.exit(0)

# Check if delegate field already exists
for node in ast.walk(target_cls):
    if isinstance(node, ast.AnnAssign) and isinstance(node.target, ast.Name) and node.target.id == delegate_field_name:
        errors.append(f"Field '{delegate_field_name}' already exists in class '{target}'")
        break
    if isinstance(node, ast.Assign):
        for t in node.targets:
            if isinstance(t, ast.Attribute) and t.attr == delegate_field_name and isinstance(t.value, ast.Name) and t.value.id == "self":
                errors.append(f"Field '{delegate_field_name}' already exists in class '{target}'")
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

function applyReplaceSuperclassWithDelegate(
  source: string,
  target: string,
  delegateFieldName: string,
): ApplyResult {
  const targetJ = JSON.stringify(target);
  const delegateFieldNameJ = JSON.stringify(delegateFieldName);

  const script = `
import ast, sys, json, re

source = sys.stdin.read()
target = ${targetJ}
delegate_field_name = ${delegateFieldNameJ}

tree = ast.parse(source)
lines = source.splitlines(True)

all_classes = {}
for node in ast.iter_child_nodes(tree):
    if isinstance(node, ast.ClassDef):
        all_classes[node.name] = node

target_cls = all_classes[target]
parent_name = ast.unparse(target_cls.bases[0])

# Get body indentation from first body member
body_indent = " " * target_cls.body[0].col_offset if target_cls.body else "    "
init_indent = body_indent + "    "

# Collect parent class methods (if parent is in the same file)
parent_cls = all_classes.get(parent_name)
parent_methods = []
if parent_cls:
    for node in ast.iter_child_nodes(parent_cls):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name not in ("__init__", "__new__"):
            parent_methods.append(node)

def get_return_annotation(method_node):
    if method_node.returns:
        return " -> " + ast.unparse(method_node.returns)
    return ""

def get_params_for_sig(method_node):
    """Get 'param: type = default' list for signature, skipping self."""
    args = method_node.args
    result = []
    total_pos = len(args.posonlyargs) + len(args.args)
    defaults_start = total_pos - len(args.defaults)
    idx = 0
    for arg in args.posonlyargs:
        ann = f": {ast.unparse(arg.annotation)}" if arg.annotation else ""
        if idx >= defaults_start:
            dv = ast.get_source_segment(source, args.defaults[idx - defaults_start]) or ""
            result.append(f"{arg.arg}{ann}={dv}")
        else:
            result.append(f"{arg.arg}{ann}")
        idx += 1
    for arg in args.args:
        if arg.arg == "self":
            idx += 1
            continue
        ann = f": {ast.unparse(arg.annotation)}" if arg.annotation else ""
        if idx >= defaults_start:
            dv = ast.get_source_segment(source, args.defaults[idx - defaults_start]) or ""
            result.append(f"{arg.arg}{ann}={dv}")
        else:
            result.append(f"{arg.arg}{ann}")
        idx += 1
    if args.vararg:
        ann = f": {ast.unparse(args.vararg.annotation)}" if args.vararg.annotation else ""
        result.append(f"*{args.vararg.arg}{ann}")
    for i, kwarg in enumerate(args.kwonlyargs):
        ann = f": {ast.unparse(kwarg.annotation)}" if kwarg.annotation else ""
        kd = args.kw_defaults[i] if i < len(args.kw_defaults) else None
        if kd is not None:
            dv = ast.get_source_segment(source, kd) or ""
            result.append(f"{kwarg.arg}{ann}={dv}")
        else:
            result.append(f"{kwarg.arg}{ann}")
    if args.kwarg:
        ann = f": {ast.unparse(args.kwarg.annotation)}" if args.kwarg.annotation else ""
        result.append(f"**{args.kwarg.arg}{ann}")
    return result

def get_call_args(method_node):
    """Get arg names for forwarding call (excluding self)."""
    args = method_node.args
    call_args = []
    for arg in args.posonlyargs:
        call_args.append(arg.arg)
    for arg in args.args:
        if arg.arg != "self":
            call_args.append(arg.arg)
    if args.vararg:
        call_args.append(f"*{args.vararg.arg}")
    for kwarg in args.kwonlyargs:
        call_args.append(f"{kwarg.arg}={kwarg.arg}")
    if args.kwarg:
        call_args.append(f"**{args.kwarg.arg}")
    return ", ".join(call_args)

new_lines = list(lines)

# Step 1: Remove parent from class bases
class_def_idx = target_cls.lineno - 1
class_line = new_lines[class_def_idx]
remaining_bases = [b for b in target_cls.bases if ast.unparse(b) != parent_name]
if remaining_bases:
    new_bases_str = "(" + ", ".join(ast.unparse(b) for b in remaining_bases) + ")"
else:
    new_bases_str = ""
new_class_line = re.sub(
    r'(class\\s+' + re.escape(target) + r')\\s*\\([^)]*\\)(\\s*:)',
    r'\\1' + new_bases_str + r'\\2',
    class_line
)
new_lines[class_def_idx] = new_class_line

# Step 2: Find __init__ in target class to insert delegate field
target_init = None
for node in ast.iter_child_nodes(target_cls):
    if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name == "__init__":
        target_init = node
        break

if target_init:
    # Insert delegate field at end of __init__
    field_insert_at = target_init.end_lineno
    field_line = f"{init_indent}self.{delegate_field_name} = {parent_name}()\\n"
else:
    # No __init__: add as class-level attribute after class def line
    field_insert_at = target_cls.lineno
    field_line = f"{body_indent}{delegate_field_name} = {parent_name}()\\n"

new_lines.insert(field_insert_at, field_line)

# Step 3: Re-parse to get updated positions, then add forwarding methods
temp_source = "".join(new_lines)
tree2 = ast.parse(temp_source)
classes2 = {}
for node in ast.iter_child_nodes(tree2):
    if isinstance(node, ast.ClassDef):
        classes2[node.name] = node

target_cls2 = classes2[target]
fwd_insert_at = target_cls2.end_lineno

# Build forwarding methods text (insert in reverse order to preserve line positions)
for method in reversed(parent_methods):
    ret_ann = get_return_annotation(method)
    extra_params = get_params_for_sig(method)
    sig = f"self, {', '.join(extra_params)}" if extra_params else "self"
    call_args = get_call_args(method)
    fwd_lines = (
        f"\\n{body_indent}def {method.name}({sig}){ret_ann}:\\n"
        f"{init_indent}return self.{delegate_field_name}.{method.name}({call_args})\\n"
    )
    for fl in reversed(fwd_lines.splitlines(True)):
        new_lines.insert(fwd_insert_at, fl)

new_source = "".join(new_lines)

# Validate
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
    return JSON.parse(output) as ApplyResult;
  } catch (err) {
    return {
      success: false,
      newSource: "",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
