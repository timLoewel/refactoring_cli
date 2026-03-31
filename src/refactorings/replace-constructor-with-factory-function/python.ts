import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import type { PreconditionResult, RefactoringResult } from "../../core/refactoring.types.js";
import { definePythonRefactoring, pythonParam } from "../../python/python-refactoring-builder.js";
import type { PythonProjectContext } from "../../python/python-refactoring-builder.js";

export const replaceConstructorWithFactoryFunctionPython = definePythonRefactoring({
  name: "Replace Constructor with Factory Function (Python)",
  kebabName: "replace-constructor-with-factory-function-python",
  tier: 4,
  description:
    "Introduces a named factory function (or classmethod) for a class, replacing direct constructor calls.",
  params: [
    pythonParam.file(),
    pythonParam.identifier("target", "Name of the class whose constructor to replace with a factory"),
    pythonParam.identifier("factoryName", "Name for the new factory function or classmethod"),
    pythonParam.string(
      "style",
      "Factory style: 'standalone' (default standalone function) or 'classmethod'",
      false,
    ),
  ],
  preconditions(ctx: PythonProjectContext, params: Record<string, unknown>): PreconditionResult {
    const errors: string[] = [];
    const file = params["file"] as string;
    const target = params["target"] as string;
    const factoryName = params["factoryName"] as string;

    const filePath = path.resolve(ctx.projectRoot, file);
    let source: string;
    try {
      source = readFileSync(filePath, "utf-8");
    } catch {
      errors.push(`File not found: ${file}`);
      return { ok: false, errors };
    }

    const result = validateFactory(source, target, factoryName);
    if (!result.valid) {
      errors.push(...result.errors);
    }

    return { ok: errors.length === 0, errors };
  },
  apply(ctx: PythonProjectContext, params: Record<string, unknown>): RefactoringResult {
    const file = params["file"] as string;
    const target = params["target"] as string;
    const factoryName = params["factoryName"] as string;
    const style = (params["style"] as string) || "standalone";

    const filePath = path.resolve(ctx.projectRoot, file);

    let source: string;
    try {
      source = readFileSync(filePath, "utf-8");
    } catch {
      return { success: false, filesChanged: [], description: `File not found: ${file}` };
    }

    const result = applyFactory(source, target, factoryName, style);

    if (!result.success) {
      return { success: false, filesChanged: [], description: result.error };
    }

    writeFileSync(filePath, result.newSource, "utf-8");

    return {
      success: true,
      filesChanged: [file],
      description: `Replaced constructor of '${target}' with factory '${factoryName}' (${style})`,
    };
  },
});

interface ValidateResult {
  valid: boolean;
  errors: string[];
}

function validateFactory(source: string, target: string, factoryName: string): ValidateResult {
  const script = `
import ast
import sys
import json

source = sys.stdin.read()
target = ${JSON.stringify(target)}
factory_name = ${JSON.stringify(factoryName)}

tree = ast.parse(source)
errors = []

# Check target class exists
target_cls = None
for node in ast.iter_child_nodes(tree):
    if isinstance(node, ast.ClassDef) and node.name == target:
        target_cls = node
        break

if target_cls is None:
    errors.append(f"Class '{target}' not found in file")
    print(json.dumps({"valid": False, "errors": errors}))
    sys.exit(0)

# Check factory name doesn't already exist as a top-level function
for node in ast.iter_child_nodes(tree):
    if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name == factory_name:
        errors.append(f"Function '{factory_name}' already exists in file")
        break

# Check factory name doesn't already exist as a classmethod in the target class
for node in ast.walk(target_cls):
    if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name == factory_name:
        for deco in node.decorator_list:
            if isinstance(deco, ast.Name) and deco.id == "classmethod":
                errors.append(f"Classmethod '{factory_name}' already exists in class '{target}'")
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

function applyFactory(
  source: string,
  target: string,
  factoryName: string,
  style: string,
): ApplyResult {
  const script = `
import ast
import sys
import json
import re

source = sys.stdin.read()
target = ${JSON.stringify(target)}
factory_name = ${JSON.stringify(factoryName)}
style = ${JSON.stringify(style)}

tree = ast.parse(source)
lines = source.splitlines(True)

# Find the target class
target_cls = None
for node in ast.iter_child_nodes(tree):
    if isinstance(node, ast.ClassDef) and node.name == target:
        target_cls = node
        break

if target_cls is None:
    print(json.dumps({"success": False, "newSource": "", "error": f"Class '{target}' not found"}))
    sys.exit(0)

# Extract constructor parameters (from __init__ or __new__)
# Builds a dict of class name -> ClassDef for parent lookup
all_classes = {}
for node in ast.iter_child_nodes(tree):
    if isinstance(node, ast.ClassDef):
        all_classes[node.name] = node

def extract_init_params(cls_node):
    """Extract (name, annotation_text, default_text) tuples from __init__ or __new__."""
    for node in ast.iter_child_nodes(cls_node):
        if not isinstance(node, ast.FunctionDef):
            continue
        if node.name not in ("__init__", "__new__"):
            continue
        args = node.args
        positional = args.args[1:]  # skip self/cls
        defaults_offset = len(positional) - len(args.defaults)
        params = []
        for i, arg in enumerate(positional):
            ann_text = None
            if arg.annotation:
                ann_text = ast.get_source_segment(source, arg.annotation)
            default_text = None
            default_idx = i - defaults_offset
            if default_idx >= 0:
                default_text = ast.get_source_segment(source, args.defaults[default_idx])
            params.append((arg.arg, ann_text, default_text))
        return params
    return None

init_params = extract_init_params(target_cls)

# If the class has no __init__/__new__, look at parent class
if init_params is None:
    for base in target_cls.bases:
        base_name = None
        if isinstance(base, ast.Name):
            base_name = base.id
        elif isinstance(base, ast.Attribute):
            base_name = base.attr
        if base_name and base_name in all_classes:
            parent_params = extract_init_params(all_classes[base_name])
            if parent_params is not None:
                init_params = parent_params
                break

if init_params is None:
    init_params = []

# Build parameter string for factory signature
def build_param_str(params, cls_first=False):
    parts = []
    if cls_first:
        parts.append("cls")
    for name, ann, default in params:
        p = name
        if ann:
            p = f"{name}: {ann}"
        if default is not None:
            p = f"{p} = {default}"
        parts.append(p)
    return ", ".join(parts)

# Build argument string for the constructor call
def build_arg_str(params):
    return ", ".join(name for name, _, _ in params)

param_str = build_param_str(init_params)
arg_str = build_arg_str(init_params)

# Find the class's end line and body indentation
class_end_line = target_cls.end_lineno  # 1-indexed
body_indent = "    "

# Find all ClassName(...) call sites OUTSIDE the class
class_line_start = target_cls.lineno
class_line_end = target_cls.end_lineno

# Collect call site edits
call_edits = []

def collect_calls(stmts):
    for stmt in stmts:
        for node in ast.walk(stmt):
            if not isinstance(node, ast.Call):
                continue
            if not isinstance(node.func, ast.Name):
                continue
            if node.func.id != target:
                continue
            # Skip calls inside the class definition
            if class_line_start <= node.lineno <= class_line_end:
                continue
            # Build argument text
            arg_texts = []
            for a in node.args:
                t = ast.get_source_segment(source, a)
                if t:
                    arg_texts.append(t)
            for kw in node.keywords:
                t = ast.get_source_segment(source, kw.value)
                if t:
                    if kw.arg:
                        arg_texts.append(f"{kw.arg}={t}")
                    else:
                        arg_texts.append(f"**{t}")
            if style == "classmethod":
                replacement_call = f"{target}.{factory_name}({', '.join(arg_texts)})"
            else:
                replacement_call = f"{factory_name}({', '.join(arg_texts)})"
            # Get the exact source span of the call
            call_src = ast.get_source_segment(source, node)
            if call_src:
                call_edits.append({
                    "lineno": node.lineno,
                    "col_offset": node.col_offset,
                    "end_lineno": node.end_lineno,
                    "end_col_offset": node.end_col_offset,
                    "replacement": replacement_call,
                })

collect_calls(tree.body)

# Apply call site edits bottom-to-top
call_edits.sort(key=lambda e: (e["lineno"], e["col_offset"]), reverse=True)

new_lines = list(lines)

for edit in call_edits:
    sl = edit["lineno"] - 1
    sc = edit["col_offset"]
    el = edit["end_lineno"] - 1
    ec = edit["end_col_offset"]
    repl = edit["replacement"]

    if sl == el:
        orig = new_lines[sl]
        new_lines[sl] = orig[:sc] + repl + orig[ec:]
    else:
        # Multi-line call
        first_line = new_lines[sl][:sc] + repl
        new_lines[sl:el + 1] = [first_line + "\\n"]

new_source = "".join(new_lines)

if style == "classmethod":
    # Insert @classmethod factory inside the class, after the last method
    # Find the last method in the class to get insertion point
    # We'll insert before the class end
    tree2 = ast.parse(new_source)
    lines2 = new_source.splitlines(True)
    target_cls2 = None
    for node in ast.iter_child_nodes(tree2):
        if isinstance(node, ast.ClassDef) and node.name == target:
            target_cls2 = node
            break
    if target_cls2 is None:
        print(json.dumps({"success": False, "newSource": "", "error": "Class not found after edit"}))
        sys.exit(0)

    insert_line = target_cls2.end_lineno  # 1-indexed last line of class body
    # Build classmethod text (insert after the last class body line)
    factory_lines = [
        "\\n",
        f"{body_indent}@classmethod\\n",
        f"{body_indent}def {factory_name}(cls, {param_str}) -> \\"{target}\\":\\n",
        f"{body_indent}{body_indent}return cls({arg_str})\\n",
    ]
    new_lines2 = list(lines2)
    new_lines2[insert_line:insert_line] = factory_lines
    new_source = "".join(new_lines2)
else:
    # Append standalone factory function at end of file
    tree2 = ast.parse(new_source)
    lines2 = list(new_source.splitlines(True))
    while lines2 and lines2[-1].strip() == "":
        lines2.pop()
    ret_ann = f' -> "{target}"'
    factory_text = (
        f"\\n\\ndef {factory_name}({param_str}){ret_ann}:\\n"
        f"    return {target}({arg_str})\\n"
    )
    lines2.append(factory_text)
    new_source = "".join(lines2)

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
