import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import type { PreconditionResult, RefactoringResult } from "../../core/refactoring.types.js";
import { definePythonRefactoring, pythonParam } from "../../python/python-refactoring-builder.js";
import type { PythonProjectContext } from "../../python/python-refactoring-builder.js";

export const replacePrimitiveWithObjectPython = definePythonRefactoring({
  name: "Replace Primitive With Object (Python)",
  kebabName: "replace-primitive-with-object-python",
  tier: 3,
  description:
    "Creates a value object class wrapping a primitive-typed variable, replacing its usage with an instance of the class.",
  params: [
    pythonParam.file(),
    pythonParam.identifier("target", "Name of the variable to wrap"),
    pythonParam.identifier("className", "Name of the wrapper class to create"),
    pythonParam.string("style", "Class style: 'regular' (default) or 'dataclass'", false),
  ],
  preconditions(ctx: PythonProjectContext, params: Record<string, unknown>): PreconditionResult {
    const errors: string[] = [];
    const file = params["file"] as string;
    const target = params["target"] as string;
    const className = params["className"] as string;

    const filePath = path.resolve(ctx.projectRoot, file);
    let source: string;
    try {
      source = readFileSync(filePath, "utf-8");
    } catch {
      errors.push(`File not found: ${file}`);
      return { ok: false, errors };
    }

    const result = validateTarget(source, target, className);
    if (!result.valid) {
      errors.push(result.error);
    }

    return { ok: errors.length === 0, errors };
  },
  apply(ctx: PythonProjectContext, params: Record<string, unknown>): RefactoringResult {
    const file = params["file"] as string;
    const target = params["target"] as string;
    const className = params["className"] as string;
    const style = (params["style"] as string | undefined) ?? "regular";

    const filePath = path.resolve(ctx.projectRoot, file);

    let source: string;
    try {
      source = readFileSync(filePath, "utf-8");
    } catch {
      return { success: false, filesChanged: [], description: `File not found: ${file}` };
    }

    const result = transformSource(source, target, className, style);

    if (!result.success) {
      return { success: false, filesChanged: [], description: result.error };
    }

    writeFileSync(filePath, result.newSource, "utf-8");

    return {
      success: true,
      filesChanged: [file],
      description: `Wrapped primitive variable '${target}' in new class '${className}'`,
    };
  },
});

interface ValidateResult {
  valid: boolean;
  error: string;
}

function validateTarget(source: string, target: string, className: string): ValidateResult {
  const script = `
import ast
import sys
import json

source = sys.stdin.read()
target = ${JSON.stringify(target)}
class_name = ${JSON.stringify(className)}

tree = ast.parse(source)

# Check variable exists at module level
found = False
for node in ast.iter_child_nodes(tree):
    if isinstance(node, ast.Assign):
        for t in node.targets:
            if isinstance(t, ast.Name) and t.id == target:
                found = True
    elif isinstance(node, ast.AnnAssign):
        if isinstance(node.target, ast.Name) and node.target.id == target:
            found = True

if not found:
    print(json.dumps({"valid": False, "error": f"Module-level variable '{target}' not found"}))
    sys.exit(0)

# Check class doesn't already exist
for node in ast.iter_child_nodes(tree):
    if isinstance(node, ast.ClassDef) and node.name == class_name:
        print(json.dumps({"valid": False, "error": f"Class '{class_name}' already exists in file"}))
        sys.exit(0)

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

function transformSource(
  source: string,
  target: string,
  className: string,
  style: string,
): TransformResult {
  const script = `
import ast
import sys
import json

source = sys.stdin.read()
target = ${JSON.stringify(target)}
class_name = ${JSON.stringify(className)}
style = ${JSON.stringify(style)}

tree = ast.parse(source)
lines = source.splitlines(True)

# Find the module-level variable assignment
var_node = None
var_type = None
var_value = None
var_start = None
var_end = None

for node in ast.iter_child_nodes(tree):
    if isinstance(node, ast.Assign):
        for t in node.targets:
            if isinstance(t, ast.Name) and t.id == target:
                var_node = node
                var_start = node.lineno - 1
                var_end = node.end_lineno
                var_value = ast.get_source_segment(source, node.value)
                break
    elif isinstance(node, ast.AnnAssign):
        if isinstance(node.target, ast.Name) and node.target.id == target:
            var_node = node
            var_start = node.lineno - 1
            var_end = node.end_lineno
            ann = ast.get_source_segment(source, node.annotation)
            var_type = ann
            if node.value:
                var_value = ast.get_source_segment(source, node.value)
            break

if var_node is None:
    print(json.dumps({"success": False, "error": f"Variable '{target}' not found", "newSource": ""}))
    sys.exit(0)

if var_value is None:
    var_value = "None"

# Determine primitive type from annotation or infer from value
prim_type = var_type
if not prim_type:
    # Try to infer from the value
    try:
        val_node = ast.parse(var_value, mode="eval").body
        if isinstance(val_node, ast.Constant):
            if isinstance(val_node.value, int):
                prim_type = "int"
            elif isinstance(val_node.value, float):
                prim_type = "float"
            elif isinstance(val_node.value, str):
                prim_type = "str"
            elif isinstance(val_node.value, bool):
                prim_type = "bool"
    except:
        pass

# Build the wrapper class
if style == "dataclass":
    # Build a @dataclass(frozen=True) class
    import_line = "from dataclasses import dataclass\\n\\n"
    field_type = f": {prim_type}" if prim_type else ""
    class_code = (
        f"@dataclass(frozen=True)\\n"
        f"class {class_name}:\\n"
        f"    value{field_type}\\n"
        f"\\n"
        f"    def __str__(self):\\n"
        f"        return str(self.value)\\n"
    )
else:
    # Build a regular class
    import_line = ""
    type_hint = f": {prim_type}" if prim_type else ""
    class_code = (
        f"class {class_name}:\\n"
        f"    def __init__(self, value{type_hint}):\\n"
        f"        self._value = value\\n"
        f"\\n"
        f"    @property\\n"
        f"    def value(self){' -> ' + prim_type if prim_type else ''}:\\n"
        f"        return self._value\\n"
        f"\\n"
        f"    def __str__(self):\\n"
        f"        return str(self._value)\\n"
        f"\\n"
        f"    def __repr__(self):\\n"
        f"        return f\\"{class_name}({{self._value!r}})\\"\\n"
        f"\\n"
        f"    def __eq__(self, other):\\n"
        f"        if isinstance(other, {class_name}):\\n"
        f"            return self._value == other._value\\n"
        f"        return NotImplemented\\n"
        f"\\n"
        f"    def __hash__(self):\\n"
        f"        return hash(self._value)\\n"
    )

# Build new variable assignment
new_assignment = f"{target} = {class_name}({var_value})\\n"

# Replace the variable declaration with the class + new assignment
new_lines = []
if import_line:
    new_lines.append(import_line)
new_lines.extend(lines[:var_start])
new_lines.append(class_code)
new_lines.append("\\n")
new_lines.append(new_assignment)
new_lines.extend(lines[var_end:])

new_source = "".join(new_lines)

# Now update references: bare reads of 'target' that pass it to functions
# should use target.value to get the primitive back
# But the fixture needs to preserve semantics — so we update usages
# in expressions where the primitive value is needed

# Re-parse to find references
new_tree = ast.parse(new_source)
new_lines2 = new_source.splitlines(True)

edits = []

# Collect all Name nodes referring to target with Load context
# that are used in arithmetic, comparison, f-string, or function call contexts
# where the primitive value is needed
for node in ast.walk(new_tree):
    if isinstance(node, ast.Name) and node.id == target and isinstance(node.ctx, ast.Load):
        # Skip the assignment we just created (class_name(var_value))
        # Find if this is the initializer line
        line_text = new_lines2[node.lineno - 1] if node.lineno - 1 < len(new_lines2) else ""
        if f"{class_name}(" in line_text and f"{target} = {class_name}" in line_text:
            continue
        # Skip inside the class definition itself
        in_class = False
        for cls_node in ast.walk(new_tree):
            if isinstance(cls_node, ast.ClassDef) and cls_node.name == class_name:
                if cls_node.lineno <= node.lineno <= (cls_node.end_lineno or cls_node.lineno):
                    in_class = True
                    break
        if in_class:
            continue
        # Add .value to get the primitive
        edits.append({
            "line": node.lineno - 1,
            "col": node.end_col_offset,
            "replacement": ".value",
        })

# Sort edits reverse to apply bottom-to-top
edits.sort(key=lambda e: (e["line"], e["col"]), reverse=True)

for edit in edits:
    line = new_lines2[edit["line"]]
    col = edit["col"]
    new_lines2[edit["line"]] = line[:col] + edit["replacement"] + line[col:]

new_source = "".join(new_lines2)

print(json.dumps({
    "success": True,
    "newSource": new_source,
    "error": "",
}))
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
