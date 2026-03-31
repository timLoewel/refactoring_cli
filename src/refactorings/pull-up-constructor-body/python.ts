import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import type { PreconditionResult, RefactoringResult } from "../../core/refactoring.types.js";
import { definePythonRefactoring, pythonParam } from "../../python/python-refactoring-builder.js";
import type { PythonProjectContext } from "../../python/python-refactoring-builder.js";

export const pullUpConstructorBodyPython = definePythonRefactoring({
  name: "Pull Up Constructor Body (Python)",
  kebabName: "pull-up-constructor-body-python",
  tier: 4,
  description:
    "Moves common __init__ logic from a subclass up to the superclass constructor.",
  params: [
    pythonParam.file(),
    pythonParam.identifier("target", "Name of the subclass whose constructor body to pull up"),
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

    const result = validatePullUp(source, target);
    if (!result.valid) {
      errors.push(...result.errors);
    }

    return { ok: errors.length === 0, errors };
  },
  apply(ctx: PythonProjectContext, params: Record<string, unknown>): RefactoringResult {
    const file = params["file"] as string;
    const target = params["target"] as string;

    const filePath = path.resolve(ctx.projectRoot, file);
    let source: string;
    try {
      source = readFileSync(filePath, "utf-8");
    } catch {
      return { success: false, filesChanged: [], description: `File not found: ${file}` };
    }

    const result = applyPullUp(source, target);
    if (!result.success) {
      return { success: false, filesChanged: [], description: result.error };
    }

    writeFileSync(filePath, result.newSource, "utf-8");
    return {
      success: true,
      filesChanged: [file],
      description: `Pulled constructor body of '${target}' up to parent class`,
    };
  },
});

interface ValidateResult {
  valid: boolean;
  errors: string[];
}

function validatePullUp(source: string, target: string): ValidateResult {
  const script = `
import ast
import sys
import json

source = sys.stdin.read()
target = ${JSON.stringify(target)}

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

# Check for @dataclass decorator
def is_dataclass(cls_node):
    for dec in cls_node.decorator_list:
        if isinstance(dec, ast.Name) and dec.id == "dataclass":
            return True
        if isinstance(dec, ast.Attribute) and dec.attr == "dataclass":
            return True
        if isinstance(dec, ast.Call):
            func = dec.func
            if isinstance(func, ast.Name) and func.id == "dataclass":
                return True
            if isinstance(func, ast.Attribute) and func.attr == "dataclass":
                return True
    return False

if is_dataclass(target_cls):
    errors.append(f"Class '{target}' is a @dataclass — __init__ is generated and cannot be pulled up")
    print(json.dumps({"valid": False, "errors": errors}))
    sys.exit(0)

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

# Find target's __init__
target_init = None
for node in ast.iter_child_nodes(target_cls):
    if isinstance(node, ast.FunctionDef) and node.name == "__init__":
        target_init = node
        break

if target_init is None:
    errors.append(f"Class '{target}' has no __init__ method")

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

function applyPullUp(source: string, target: string): ApplyResult {
  const script = `
import ast
import sys
import json
import textwrap

source = sys.stdin.read()
target = ${JSON.stringify(target)}

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

# Find target's __init__
target_init = None
for node in ast.iter_child_nodes(target_cls):
    if isinstance(node, ast.FunctionDef) and node.name == "__init__":
        target_init = node
        break

# Find parent's __init__
parent_init = None
for node in ast.iter_child_nodes(parent_cls):
    if isinstance(node, ast.FunctionDef) and node.name == "__init__":
        parent_init = node
        break

def is_super_init(stmt):
    """Check if stmt is a super().__init__(...) call."""
    if not isinstance(stmt, ast.Expr):
        return False
    call = stmt.value
    if not isinstance(call, ast.Call):
        return False
    func = call.func
    if not isinstance(func, ast.Attribute):
        return False
    if func.attr != "__init__":
        return False
    val = func.value
    return (isinstance(val, ast.Call) and
            isinstance(val.func, ast.Name) and
            val.func.id == "super")

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

def get_body_indent(cls):
    for node in ast.iter_child_nodes(cls):
        if hasattr(node, "col_offset"):
            return node.col_offset
    return 4

def get_params_text_no_self(init_fn):
    """Build param list text excluding 'self', preserving annotations and defaults."""
    args = init_fn.args
    reg_args = args.args[1:]  # skip self
    n_defaults = len(args.defaults)
    n_reg = len(reg_args)

    parts = []
    for i, arg in enumerate(reg_args):
        piece = arg.arg
        if arg.annotation:
            piece += ": " + ast.get_source_segment(source, arg.annotation)
        def_idx = i - (n_reg - n_defaults)
        if def_idx >= 0:
            piece += " = " + ast.get_source_segment(source, args.defaults[def_idx])
        parts.append(piece)

    if args.vararg:
        va = "*" + args.vararg.arg
        if args.vararg.annotation:
            va += ": " + ast.get_source_segment(source, args.vararg.annotation)
        parts.append(va)
    elif args.kwonlyargs:
        parts.append("*")

    kw_defaults = args.kw_defaults
    for i, kw in enumerate(args.kwonlyargs):
        piece = kw.arg
        if kw.annotation:
            piece += ": " + ast.get_source_segment(source, kw.annotation)
        kd = kw_defaults[i] if i < len(kw_defaults) else None
        if kd is not None:
            piece += " = " + ast.get_source_segment(source, kd)
        parts.append(piece)

    if args.kwarg:
        kwa = "**" + args.kwarg.arg
        if args.kwarg.annotation:
            kwa += ": " + ast.get_source_segment(source, args.kwarg.annotation)
        parts.append(kwa)

    return ", ".join(parts)

def get_call_args_names(init_fn):
    """Get the argument names to pass in super().__init__(...) call."""
    args = init_fn.args
    parts = []
    for arg in args.args[1:]:  # skip self
        parts.append(arg.arg)
    if args.vararg:
        parts.append("*" + args.vararg.arg)
    for kw in args.kwonlyargs:
        parts.append(f"{kw.arg}={kw.arg}")
    if args.kwarg:
        parts.append("**" + args.kwarg.arg)
    return ", ".join(parts)

# Separate super().__init__() calls from other statements
super_stmts = [s for s in target_init.body if is_super_init(s)]
non_super_stmts = [s for s in target_init.body if not is_super_init(s)]

if not non_super_stmts:
    print(json.dumps({"success": False, "newSource": "", "error": "No non-super statements to pull up"}))
    sys.exit(0)

# Get non-super statement lines
src_body_indent = non_super_stmts[0].col_offset

non_super_lines = []
for s in non_super_stmts:
    non_super_lines.extend(lines[s.lineno - 1:s.end_lineno])

ops = []

if parent_init is not None:
    # Parent already has __init__: append non-super statements to it
    dst_indent = parent_init.body[0].col_offset
    re_indented = reindent_lines(non_super_lines, src_body_indent, dst_indent)
    ops.append(("insert", parent_init.end_lineno, re_indented))
else:
    # Parent has no __init__: create one with same params as subclass
    params_text = get_params_text_no_self(target_init)
    parent_body_indent_n = get_body_indent(parent_cls)
    body_indent = " " * (parent_body_indent_n + 4)

    # Re-indent the moved statements to match the new __init__ body
    re_indented = reindent_lines(non_super_lines, src_body_indent, parent_body_indent_n + 4)

    method_indent = " " * parent_body_indent_n
    if params_text:
        def_line = method_indent + f"def __init__(self, {params_text}):\\n"
    else:
        def_line = method_indent + "def __init__(self):\\n"

    new_init_lines = ["\\n", def_line] + re_indented

    ops.append(("insert", parent_cls.end_lineno, new_init_lines))

    # Update super().__init__() call in subclass if it has no args
    call_args = get_call_args_names(target_init)
    if call_args:
        for s in super_stmts:
            call = s.value
            if not call.args and not call.keywords:
                # Replace super().__init__() with super().__init__(call_args)
                # The call's end col is the closing paren; we need to replace the whole call text
                # Simplest: rewrite the entire super().__init__(...) line
                line_idx = s.lineno - 1
                old_line = lines[line_idx]
                stmt_indent = " " * s.col_offset
                new_line = stmt_indent + f"super().__init__({call_args})\\n"
                ops.append(("replace", line_idx, new_line))

# Remove non-super statements from subclass's __init__
for s in non_super_stmts:
    # Also remove blank lines immediately before the statement if at the start of body
    start = s.lineno - 1
    end = s.end_lineno
    # Scan backward to remove preceding blank lines (only if they're part of init body)
    scan = start - 1
    while scan >= target_init.body[0].lineno - 1:
        line_content = lines[scan].strip()
        if line_content == "":
            start = scan
            scan -= 1
        else:
            break
    ops.append(("delete", start, end))

# Sort descending by line number so edits don't shift each other
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
