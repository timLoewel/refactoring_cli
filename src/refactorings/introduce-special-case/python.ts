import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import type { PreconditionResult, RefactoringResult } from "../../core/refactoring.types.js";
import { definePythonRefactoring, pythonParam } from "../../python/python-refactoring-builder.js";
import type { PythonProjectContext } from "../../python/python-refactoring-builder.js";

export const introduceSpecialCasePython = definePythonRefactoring({
  name: "Introduce Special Case (Python)",
  kebabName: "introduce-special-case-python",
  tier: 2,
  description:
    "Introduces a special-case subclass to replace repeated conditional checks for a particular value.",
  params: [
    pythonParam.file(),
    pythonParam.identifier("target", "Name of the class to introduce a special case for"),
    pythonParam.string(
      "specialValue",
      "The special value that triggers special-case behaviour (e.g. 'unknown' or 'None')",
    ),
    pythonParam.identifier("specialClassName", "Name for the new special-case subclass"),
  ],
  preconditions(ctx: PythonProjectContext, params: Record<string, unknown>): PreconditionResult {
    const errors: string[] = [];
    const file = params["file"] as string;
    const target = params["target"] as string;
    const specialClassName = params["specialClassName"] as string;

    const filePath = path.resolve(ctx.projectRoot, file);
    let source: string;
    try {
      source = readFileSync(filePath, "utf-8");
    } catch {
      errors.push(`File not found: ${file}`);
      return { ok: false, errors };
    }

    const result = validateIntroduceSpecialCase(source, target, specialClassName);
    if (!result.valid) {
      errors.push(...result.errors);
    }

    return { ok: errors.length === 0, errors };
  },
  apply(ctx: PythonProjectContext, params: Record<string, unknown>): RefactoringResult {
    const file = params["file"] as string;
    const target = params["target"] as string;
    const specialValue = params["specialValue"] as string;
    const specialClassName = params["specialClassName"] as string;

    const filePath = path.resolve(ctx.projectRoot, file);

    let source: string;
    try {
      source = readFileSync(filePath, "utf-8");
    } catch {
      return { success: false, filesChanged: [], description: `File not found: ${file}` };
    }

    const result = applyIntroduceSpecialCase(source, target, specialValue, specialClassName);

    if (!result.success) {
      return { success: false, filesChanged: [], description: result.error };
    }

    writeFileSync(filePath, result.newSource, "utf-8");

    return {
      success: true,
      filesChanged: [file],
      description: `Introduced special case class '${specialClassName}' for '${target}' with value '${specialValue}'`,
    };
  },
});

interface ValidateResult {
  valid: boolean;
  errors: string[];
}

function validateIntroduceSpecialCase(
  source: string,
  target: string,
  specialClassName: string,
): ValidateResult {
  const script = `
import ast
import sys
import json

source = sys.stdin.read()
target = ${JSON.stringify(target)}
special_class_name = ${JSON.stringify(specialClassName)}

tree = ast.parse(source)
errors = []

# Find target class
target_cls = None
for node in ast.walk(tree):
    if isinstance(node, ast.ClassDef) and node.name == target:
        target_cls = node
        break

if target_cls is None:
    errors.append(f"Class '{target}' not found in file")

# Check special class doesn't already exist
for node in ast.walk(tree):
    if isinstance(node, ast.ClassDef) and node.name == special_class_name:
        errors.append(f"Class '{special_class_name}' already exists in file")
        break

print(json.dumps({"valid": len(errors) == 0, "errors": errors}))
`;

  try {
    const output = execFileSync("python3", ["-c", script], {
      input: source,
      encoding: "utf-8",
    });
    const result = JSON.parse(output.trim()) as { valid: boolean; errors: string[] };
    return result;
  } catch {
    return { valid: false, errors: ["Failed to parse Python file"] };
  }
}

interface ApplyResult {
  success: boolean;
  newSource: string;
  error: string;
}

function applyIntroduceSpecialCase(
  source: string,
  target: string,
  specialValue: string,
  specialClassName: string,
): ApplyResult {
  const script = `
import ast
import sys
import json

source = sys.stdin.read()
target = ${JSON.stringify(target)}
special_value = ${JSON.stringify(specialValue)}
special_class_name = ${JSON.stringify(specialClassName)}
is_none_pattern = (special_value == "None")

tree = ast.parse(source)
lines = source.splitlines(keepends=True)

# Find target class
target_cls = None
for node in ast.walk(tree):
    if isinstance(node, ast.ClassDef) and node.name == target:
        target_cls = node
        break

if target_cls is None:
    print(json.dumps({"success": False, "error": f"Class '{target}' not found"}))
    sys.exit(0)

# Determine body indentation from first method
body_indent = "    "
for stmt in target_cls.body:
    if isinstance(stmt, (ast.FunctionDef, ast.AsyncFunctionDef)):
        body_indent = " " * stmt.col_offset
        break

inner_indent = body_indent + "    "

# Collect public methods (non-dunder, non-private)
public_methods = []
for stmt in target_cls.body:
    if isinstance(stmt, (ast.FunctionDef, ast.AsyncFunctionDef)):
        name = stmt.name
        if name != "__init__" and not name.startswith("__") and not name.startswith("_"):
            public_methods.append(stmt)

def get_return_type_text(method):
    if method.returns is None:
        return None
    return ast.get_source_segment(source, method.returns) or ""

def get_default_return(method):
    ret = get_return_type_text(method)
    if ret is None or ret == "None":
        return "pass"
    if ret in ("str",):
        if is_none_pattern:
            return 'return ""'
        return f'return {json.dumps(special_value)}'
    if ret in ("int", "float"):
        return "return 0"
    if ret in ("bool",):
        return "return False"
    if ret.startswith("list") or ret.startswith("List"):
        return "return []"
    if ret.startswith("dict") or ret.startswith("Dict"):
        return "return {}"
    return f"return None  # TODO: provide appropriate default for {ret}"

def build_param_list(method):
    """Reconstruct parameter list from ast, preserving type annotations."""
    args = method.args
    parts = []
    # positional args
    for arg in args.args:
        if arg.annotation:
            ann = ast.get_source_segment(source, arg.annotation) or ""
            parts.append(f"{arg.arg}: {ann}")
        else:
            parts.append(arg.arg)
    # *args
    if args.vararg:
        ann = (ast.get_source_segment(source, args.vararg.annotation) or "") if args.vararg.annotation else ""
        parts.append(f"*{args.vararg.arg}" + (f": {ann}" if ann else ""))
    # keyword-only args
    for arg in args.kwonlyargs:
        if arg.annotation:
            ann = ast.get_source_segment(source, arg.annotation) or ""
            parts.append(f"{arg.arg}: {ann}")
        else:
            parts.append(arg.arg)
    # **kwargs
    if args.kwarg:
        ann = (ast.get_source_segment(source, args.kwarg.annotation) or "") if args.kwarg.annotation else ""
        parts.append(f"**{args.kwarg.arg}" + (f": {ann}" if ann else ""))
    return ", ".join(parts)

def build_return_annotation(method):
    ret = get_return_type_text(method)
    if ret is None:
        return ""
    return f" -> {ret}"

# Build is_special_case property to add to base class (before end of class)
is_sc_prop = (
    f"\\n"
    f"{body_indent}@property\\n"
    f"{body_indent}def is_special_case(self) -> bool:\\n"
    f"{inner_indent}return False"
)

# Build special case subclass text
sc_lines = [f"class {special_class_name}({target}):"]
sc_lines.append(f"{body_indent}@property")
sc_lines.append(f"{body_indent}def is_special_case(self) -> bool:")
sc_lines.append(f"{inner_indent}return True")

for method in public_methods:
    params_text = build_param_list(method)
    ret_ann = build_return_annotation(method)
    default_ret = get_default_return(method)
    sc_lines.append("")
    sc_lines.append(f"{body_indent}def {method.name}({params_text}){ret_ann}:")
    sc_lines.append(f"{inner_indent}{default_ret}")

special_class_text = "\\n".join(sc_lines)

# --- Apply edits ---
# 1. Insert is_special_case property at end of base class body
#    We'll insert after the last statement in the class body
insert_line = target_cls.end_lineno  # 1-indexed, last line of class

# 2. Find comparison nodes to replace
#    We collect (start_offset, end_offset, replacement_text) tuples
edits = []

def get_receiver_text(node):
    """Extract receiver variable from a left-hand comparison expr."""
    if isinstance(node, ast.Call):
        # e.g. c.get_name() -> receiver is c
        if isinstance(node.func, ast.Attribute):
            return ast.get_source_segment(source, node.func.value) or None
    if isinstance(node, ast.Attribute):
        # e.g. c.name -> receiver is c
        return ast.get_source_segment(source, node.value) or None
    if isinstance(node, ast.Name):
        # e.g. c -> receiver is c
        return node.id
    return None

for node in ast.walk(tree):
    if not isinstance(node, ast.Compare):
        continue
    if len(node.ops) != 1 or len(node.comparators) != 1:
        continue
    op = node.ops[0]
    comp = node.comparators[0]
    left = node.left

    matched = False
    negated = False

    if isinstance(op, ast.Eq) and isinstance(comp, ast.Constant) and str(comp.value) == special_value:
        matched = True
        negated = False
    elif isinstance(op, ast.NotEq) and isinstance(comp, ast.Constant) and str(comp.value) == special_value:
        matched = True
        negated = True
    elif is_none_pattern and isinstance(op, ast.Is) and isinstance(comp, ast.Constant) and comp.value is None:
        matched = True
        negated = False
    elif is_none_pattern and isinstance(op, ast.IsNot) and isinstance(comp, ast.Constant) and comp.value is None:
        matched = True
        negated = True

    if not matched:
        continue

    receiver = get_receiver_text(left)
    if receiver is None:
        continue

    # Get the byte offsets for the compare node in the source
    node_text = ast.get_source_segment(source, node)
    if node_text is None:
        continue

    replacement = f"not {receiver}.is_special_case" if negated else f"{receiver}.is_special_case"
    edits.append((node.lineno, node.col_offset, node.end_lineno, node.end_col_offset, replacement))

# Apply edits to lines (in reverse order to preserve offsets)
lines_list = list(lines)

# Apply comparison replacements (bottom-to-top by line)
for start_line, start_col, end_line, end_col, replacement in sorted(edits, reverse=True):
    if start_line == end_line:
        line = lines_list[start_line - 1]
        lines_list[start_line - 1] = line[:start_col] + replacement + line[end_col:]
    else:
        # Multi-line compare (rare)
        first_line = lines_list[start_line - 1]
        lines_list[start_line - 1] = first_line[:start_col] + replacement + "\\n"
        del lines_list[start_line:end_line - 1]

# Insert is_special_case into base class
prop_line = insert_line  # 0-indexed this is insert_line (1-indexed is insert_line)
lines_list.insert(prop_line, is_sc_prop + "\\n")

# Append special case class at end of file
new_source = "".join(lines_list)
if not new_source.endswith("\\n"):
    new_source += "\\n"
new_source += "\\n\\n" + special_class_text + "\\n"

print(json.dumps({"success": True, "newSource": new_source}))
`;

  try {
    const output = execFileSync("python3", ["-c", script], {
      input: source,
      encoding: "utf-8",
    });
    const result = JSON.parse(output.trim()) as { success: boolean; newSource: string; error: string };
    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, newSource: "", error: `Python script failed: ${msg}` };
  }
}
