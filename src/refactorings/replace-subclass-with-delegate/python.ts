import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import type { PreconditionResult, RefactoringResult } from "../../core/refactoring.types.js";
import { definePythonRefactoring, pythonParam } from "../../python/python-refactoring-builder.js";
import type { PythonProjectContext } from "../../python/python-refactoring-builder.js";

export const replaceSubclassWithDelegatePython = definePythonRefactoring({
  name: "Replace Subclass with Delegate (Python)",
  kebabName: "replace-subclass-with-delegate-python",
  tier: 4,
  description:
    "Replaces inheritance by creating a delegate class that holds the subclass behavior, turning the subclass into a standalone class with a delegate field.",
  params: [
    pythonParam.file(),
    pythonParam.identifier("target", "Name of the subclass to replace with delegation"),
    pythonParam.identifier("delegateClassName", "Name for the new delegate class"),
  ],
  preconditions(ctx: PythonProjectContext, params: Record<string, unknown>): PreconditionResult {
    const errors: string[] = [];
    const file = params["file"] as string;
    const target = params["target"] as string;
    const delegateClassName = params["delegateClassName"] as string;

    const filePath = path.resolve(ctx.projectRoot, file);
    let source: string;
    try {
      source = readFileSync(filePath, "utf-8");
    } catch {
      errors.push(`File not found: ${file}`);
      return { ok: false, errors };
    }

    const result = validateReplaceSubclassWithDelegate(source, target, delegateClassName);
    if (!result.valid) {
      errors.push(...result.errors);
    }

    return { ok: errors.length === 0, errors };
  },
  apply(ctx: PythonProjectContext, params: Record<string, unknown>): RefactoringResult {
    const file = params["file"] as string;
    const target = params["target"] as string;
    const delegateClassName = params["delegateClassName"] as string;

    const filePath = path.resolve(ctx.projectRoot, file);
    let source: string;
    try {
      source = readFileSync(filePath, "utf-8");
    } catch {
      return { success: false, filesChanged: [], description: `File not found: ${file}` };
    }

    const result = applyReplaceSubclassWithDelegate(source, target, delegateClassName);
    if (!result.success) {
      return { success: false, filesChanged: [], description: result.error };
    }

    writeFileSync(filePath, result.newSource, "utf-8");
    const filesChanged: string[] = [file];

    return {
      success: true,
      filesChanged,
      description: `Replaced subclass '${target}' inheritance with delegation to new '${delegateClassName}'`,
    };
  },
});

interface ValidateResult {
  valid: boolean;
  errors: string[];
}

function validateReplaceSubclassWithDelegate(
  source: string,
  target: string,
  delegateClassName: string,
): ValidateResult {
  const targetJ = JSON.stringify(target);
  const delegateClassNameJ = JSON.stringify(delegateClassName);

  const script = `
import ast, sys, json

source = sys.stdin.read()
target = ${targetJ}
delegate_class_name = ${delegateClassNameJ}

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

if delegate_class_name in classes:
    errors.append(f"Class '{delegate_class_name}' already exists in file")

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

function applyReplaceSubclassWithDelegate(
  source: string,
  target: string,
  delegateClassName: string,
): ApplyResult {
  const targetJ = JSON.stringify(target);
  const delegateClassNameJ = JSON.stringify(delegateClassName);

  const script = `
import ast, sys, json, re, textwrap

source = sys.stdin.read()
target = ${targetJ}
delegate_class_name = ${delegateClassNameJ}

tree = ast.parse(source)
lines = source.splitlines(True)

all_classes = {}
for node in ast.iter_child_nodes(tree):
    if isinstance(node, ast.ClassDef):
        all_classes[node.name] = node

target_cls = all_classes[target]
parent_name = ast.unparse(target_cls.bases[0])

# Get body indentation from first body member (NOT iter_child_nodes — that yields base nodes first with wrong col_offset)
body_indent = " " * target_cls.body[0].col_offset if target_cls.body else "    "

# Collect subclass-specific methods (not __init__)
subclass_methods = []
for node in ast.iter_child_nodes(target_cls):
    if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name != "__init__":
        subclass_methods.append(node)

# Check if any method has super() calls
def has_super_call(method_node):
    for n in ast.walk(method_node):
        if isinstance(n, ast.Call) and isinstance(n.func, ast.Name) and n.func.id == "super":
            return True
    return False

needs_host = any(has_super_call(m) for m in subclass_methods)
host_param = "_host"

# Derive delegate field name: CamelCase -> snake_case + leading underscore
def to_snake_case(name):
    s = re.sub(r'(?<=[a-z])([A-Z])', r'_\\1', name)
    return s.lower()

delegate_field = "_" + to_snake_case(delegate_class_name)

def get_return_annotation(method_node):
    if method_node.returns:
        return " -> " + ast.unparse(method_node.returns)
    return ""

def get_params_for_sig(method_node):
    """Get 'param: type = default' list, skipping self."""
    args = method_node.args
    result = []
    total = len(args.posonlyargs) + len(args.args)
    defaults_start = total - len(args.defaults)
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
    for kwarg in args.kwonlyargs:
        ann = f": {ast.unparse(kwarg.annotation)}" if kwarg.annotation else ""
        # kwonlyarg default from kw_defaults
        ki = args.kwonlyargs.index(kwarg)
        kd = args.kw_defaults[ki] if ki < len(args.kw_defaults) else None
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
    """Get positional arg names for forwarding call (excluding self)."""
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

def get_method_text(method_node):
    """Extract method text, stripping @abstractmethod decorators."""
    if method_node.decorator_list:
        start = method_node.decorator_list[0].lineno - 1
    else:
        start = method_node.lineno - 1
    end = method_node.end_lineno
    raw_lines = lines[start:end]
    # Strip @abstractmethod lines
    filtered = [l for l in raw_lines if "@abstractmethod" not in l.split("#")[0]]
    return "".join(filtered)

# --- Build delegate class ---
delegate_parts = [f"class {delegate_class_name}:\\n"]
if needs_host:
    init_body = (
        f"{body_indent}def __init__(self, {host_param}: \\"{target}\\") -> None:\\n"
        f"{body_indent}    self.{host_param} = {host_param}\\n"
        f"\\n"
    )
    delegate_parts.append(init_body)

if not subclass_methods:
    delegate_parts.append(f"{body_indent}pass\\n")
else:
    for i, method in enumerate(subclass_methods):
        method_text = get_method_text(method)
        dedented = textwrap.dedent(method_text)
        if needs_host:
            # Replace super().method(args) with ParentClass.method(self._host, args)
            # Pattern: super().method( -> ParentName.method(self._host,  (if has args)
            #          super().method() -> ParentName.method(self._host)
            dedented = re.sub(
                r'super\\(\\)\\.([a-zA-Z_]\\w*)\\(\\)',
                f'{parent_name}.\\\\1(self.{host_param})',
                dedented
            )
            dedented = re.sub(
                r'super\\(\\)\\.([a-zA-Z_]\\w*)\\(',
                f'{parent_name}.\\\\1(self.{host_param}, ',
                dedented
            )
        re_indented = textwrap.indent(dedented, body_indent)
        delegate_parts.append(re_indented)
        if i < len(subclass_methods) - 1:
            delegate_parts.append("\\n")

delegate_text = "".join(delegate_parts) + "\\n"

# --- Build forwarding methods ---
fwd_parts = []
for method in subclass_methods:
    ret_ann = get_return_annotation(method)
    extra_params = get_params_for_sig(method)
    if extra_params:
        sig = f"self, {', '.join(extra_params)}"
    else:
        sig = "self"
    call_args = get_call_args(method)
    fwd_parts.append(
        f"\\n{body_indent}def {method.name}({sig}){ret_ann}:\\n"
        f"{body_indent}    return self.{delegate_field}.{method.name}({call_args})\\n"
    )

# --- Apply edits to lines (bottom-to-top) ---

# Collect deletion ranges for subclass methods (including leading blank lines in class)
deletions = []
for method in subclass_methods:
    if method.decorator_list:
        mstart = method.decorator_list[0].lineno - 1
    else:
        mstart = method.lineno - 1
    mend = method.end_lineno  # exclusive end in 0-indexed
    # Include preceding blank lines within the class
    limit = target_cls.lineno  # don't go above class def (0-indexed: lineno-1)
    while mstart > limit and lines[mstart - 1].strip() == "":
        mstart -= 1
    deletions.append((mstart, mend))

# Find where to insert delegate field
# Look for __init__ in target class
target_init = None
for node in ast.iter_child_nodes(target_cls):
    if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name == "__init__":
        target_init = node
        break

if needs_host:
    delegate_init_line = f"{body_indent}    self.{delegate_field} = {delegate_class_name}(self)\\n"
else:
    delegate_init_line = f"{body_indent}    self.{delegate_field} = {delegate_class_name}()\\n"

if target_init:
    # Insert at end of __init__ body (before closing)
    init_insert_at = target_init.end_lineno  # 0-indexed insert position (after last line of init)
    # Find super().__init__() call to insert after it
    for stmt in target_init.body:
        if (isinstance(stmt, ast.Expr) and isinstance(stmt.value, ast.Call)
                and isinstance(stmt.value.func, ast.Attribute)
                and stmt.value.func.attr == "__init__"
                and isinstance(stmt.value.func.value, ast.Call)
                and isinstance(stmt.value.func.value.func, ast.Name)
                and stmt.value.func.value.func.id == "super"):
            init_insert_at = stmt.end_lineno  # insert right after super().__init__()
            break
else:
    # No __init__: insert as class attr right after class def
    init_insert_at = target_cls.lineno  # insert after class def line (1-indexed becomes 0-indexed)

# Apply changes in proper order: deletions first, then insertions (bottom-to-top)
new_lines2 = list(lines)

# Step A: delete methods (bottom to top on original lines)
for mstart, mend in sorted(deletions, reverse=True):
    del new_lines2[mstart:mend]

# Step B: fix class def line — remove parent from bases
# Re-parse to find new positions after deletions
temp_source = "".join(new_lines2)
try:
    tree_b = ast.parse(temp_source)
except SyntaxError:
    # If empty class body, add pass
    # Find empty class blocks and add pass
    fixed_lines = list(new_lines2)
    i = 0
    while i < len(fixed_lines):
        line = fixed_lines[i]
        # Detect class def line
        m = re.match(r'^(\\s*)class\\s+\\w+.*:\\s*$', line)
        if m:
            indent = m.group(1)
            body_ind = indent + "    "
            # Check if next non-empty line has correct indent
            j = i + 1
            while j < len(fixed_lines) and fixed_lines[j].strip() == "":
                j += 1
            if j >= len(fixed_lines) or not fixed_lines[j].startswith(body_ind):
                fixed_lines.insert(i + 1, body_ind + "pass\\n")
        i += 1
    new_lines2 = fixed_lines
    temp_source = "".join(new_lines2)
    tree_b = ast.parse(temp_source)

classes_b = {}
for node in ast.iter_child_nodes(tree_b):
    if isinstance(node, ast.ClassDef):
        classes_b[node.name] = node

target_cls_b = classes_b[target]
class_def_idx = target_cls_b.lineno - 1
class_line = new_lines2[class_def_idx]
# Remove parent from bases: keep other bases
remaining_bases_b = [b for b in target_cls_b.bases if ast.unparse(b) != parent_name]
if remaining_bases_b:
    new_bases_str = "(" + ", ".join(ast.unparse(b) for b in remaining_bases_b) + ")"
else:
    new_bases_str = ""
new_class_line = re.sub(
    r'(class\\s+' + re.escape(target) + r')\\s*\\([^)]*\\)(\\s*:)',
    r'\\1' + new_bases_str + r'\\2',
    class_line
)
new_lines2[class_def_idx] = new_class_line

# Step C: find __init__ and add delegate field
temp_source2 = "".join(new_lines2)
tree_c = ast.parse(temp_source2)
classes_c = {}
for node in ast.iter_child_nodes(tree_c):
    if isinstance(node, ast.ClassDef):
        classes_c[node.name] = node

target_cls_c = classes_c[target]
target_init_c = None
for node in ast.iter_child_nodes(target_cls_c):
    if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name == "__init__":
        target_init_c = node
        break

# Determine insert position for delegate field
if target_init_c:
    # Default: end of __init__ body
    field_insert_at = target_init_c.end_lineno
    # If super().__init__() present, insert right after it
    for stmt in target_init_c.body:
        if (isinstance(stmt, ast.Expr) and isinstance(stmt.value, ast.Call)
                and isinstance(stmt.value.func, ast.Attribute)
                and stmt.value.func.attr == "__init__"
                and isinstance(stmt.value.func.value, ast.Call)
                and isinstance(stmt.value.func.value.func, ast.Name)
                and stmt.value.func.value.func.id == "super"):
            field_insert_at = stmt.end_lineno
            break
else:
    # No __init__: add as class-level attr right after class def
    field_insert_at = target_cls_c.lineno

init_indent2 = body_indent + "    "
if target_init_c:
    if needs_host:
        field_line = f"{init_indent2}self.{delegate_field} = {delegate_class_name}(self)\\n"
    else:
        field_line = f"{init_indent2}self.{delegate_field} = {delegate_class_name}()\\n"
else:
    if needs_host:
        field_line = f"{body_indent}{delegate_field}: \\"{delegate_class_name}\\" = None  # set in __init__\\n"
    else:
        field_line = f"{body_indent}{delegate_field} = {delegate_class_name}()\\n"
new_lines2.insert(field_insert_at, field_line)

# Step D: add forwarding methods at end of target class
temp_source3 = "".join(new_lines2)
tree_d = ast.parse(temp_source3)
classes_d = {}
for node in ast.iter_child_nodes(tree_d):
    if isinstance(node, ast.ClassDef):
        classes_d[node.name] = node

target_cls_d = classes_d[target]
fwd_at = target_cls_d.end_lineno  # insert after last line of class

for fwd_text in reversed(fwd_parts):
    for fl in reversed(fwd_text.splitlines(True)):
        new_lines2.insert(fwd_at, fl)

# Step E: insert delegate class before target class
temp_source4 = "".join(new_lines2)
tree_e = ast.parse(temp_source4)
classes_e = {}
for node in ast.iter_child_nodes(tree_e):
    if isinstance(node, ast.ClassDef):
        classes_e[node.name] = node

target_cls_e = classes_e[target]
delegate_at = target_cls_e.lineno - 1  # insert before class def

delegate_lines_list = delegate_text.splitlines(True)
new_lines2[delegate_at:delegate_at] = delegate_lines_list + ["\\n"]

new_source = "".join(new_lines2)

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

function collectPythonFiles(dir: string): string[] {
  const results: string[] = [];
  function walk(current: string): void {
    let entries: string[];
    try {
      entries = readdirSync(current);
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.startsWith(".") || entry === "__pycache__" || entry === "node_modules") continue;
      const full = path.join(current, entry);
      let stat;
      try {
        stat = statSync(full);
      } catch {
        continue;
      }
      if (stat.isDirectory()) {
        walk(full);
      } else if (entry.endsWith(".py")) {
        results.push(path.relative(dir, full));
      }
    }
  }
  walk(dir);
  return results;
}

void collectPythonFiles;
