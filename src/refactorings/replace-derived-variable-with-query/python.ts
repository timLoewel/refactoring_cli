import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import type { PreconditionResult, RefactoringResult } from "../../core/refactoring.types.js";
import { definePythonRefactoring, pythonParam } from "../../python/python-refactoring-builder.js";
import type { PythonProjectContext } from "../../python/python-refactoring-builder.js";

export const replaceDerivedVariableWithQueryPython = definePythonRefactoring({
  name: "Replace Derived Variable With Query (Python)",
  kebabName: "replace-derived-variable-with-query-python",
  tier: 2,
  description:
    "Replaces a class field that holds a derived value (assigned in __init__) with a @property getter that computes it on demand.",
  params: [
    pythonParam.file(),
    pythonParam.identifier("target", "Name of the derived attribute to convert into a property"),
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

    const result = validateReplaceDerivedVariableWithQuery(source, target);
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

    const result = applyReplaceDerivedVariableWithQuery(source, target);
    if (!result.success) {
      return { success: false, filesChanged: [], description: result.error };
    }

    writeFileSync(filePath, result.newSource, "utf-8");

    return {
      success: true,
      filesChanged: [file],
      description: `Converted derived attribute '${target}' into a @property getter`,
    };
  },
});

interface ValidationResult {
  valid: boolean;
  errors: string[];
}

interface TransformResult {
  success: boolean;
  newSource: string;
  error: string;
}

function validateReplaceDerivedVariableWithQuery(source: string, target: string): ValidationResult {
  const script = `
import ast, json, sys

source = sys.stdin.read()
target = ${JSON.stringify(target)}

try:
    tree = ast.parse(source)
except SyntaxError as e:
    print(json.dumps({"valid": False, "errors": [f"Syntax error: {e}"]}))
    sys.exit(0)

found = False
for node in ast.walk(tree):
    if not isinstance(node, ast.ClassDef):
        continue
    for stmt in node.body:
        if not (isinstance(stmt, ast.FunctionDef) and stmt.name == "__init__"):
            continue
        for s in stmt.body:
            if (
                isinstance(s, ast.Assign)
                and len(s.targets) == 1
                and isinstance(s.targets[0], ast.Attribute)
                and isinstance(s.targets[0].value, ast.Name)
                and s.targets[0].value.id == "self"
                and s.targets[0].attr == target
            ):
                found = True
                break
            if (
                isinstance(s, ast.AnnAssign)
                and isinstance(s.target, ast.Attribute)
                and isinstance(s.target.value, ast.Name)
                and s.target.value.id == "self"
                and s.target.attr == target
                and s.value is not None
            ):
                found = True
                break

if not found:
    print(json.dumps({"valid": False, "errors": [f"No derived assignment 'self.{target} = ...' found in any __init__"]}))
    sys.exit(0)

print(json.dumps({"valid": True, "errors": []}))
`;

  try {
    const output = execFileSync("python3", ["-c", script], {
      encoding: "utf-8",
      input: source,
      timeout: 10_000,
    }).trim();

    return JSON.parse(output) as ValidationResult;
  } catch (err) {
    return {
      valid: false,
      errors: [err instanceof Error ? err.message : String(err)],
    };
  }
}

function applyReplaceDerivedVariableWithQuery(source: string, target: string): TransformResult {
  const script = `
import ast, json, sys, textwrap

source = sys.stdin.read()
target = ${JSON.stringify(target)}

tree = ast.parse(source)
lines = source.splitlines(True)

result_class = None
result_init = None
result_assign = None

for node in ast.walk(tree):
    if not isinstance(node, ast.ClassDef):
        continue
    for stmt in node.body:
        if not (isinstance(stmt, ast.FunctionDef) and stmt.name == "__init__"):
            continue
        for s in stmt.body:
            if (
                isinstance(s, ast.Assign)
                and len(s.targets) == 1
                and isinstance(s.targets[0], ast.Attribute)
                and isinstance(s.targets[0].value, ast.Name)
                and s.targets[0].value.id == "self"
                and s.targets[0].attr == target
            ):
                result_class = node
                result_init = stmt
                result_assign = s
                break
            if (
                isinstance(s, ast.AnnAssign)
                and isinstance(s.target, ast.Attribute)
                and isinstance(s.target.value, ast.Name)
                and s.target.value.id == "self"
                and s.target.attr == target
                and s.value is not None
            ):
                result_class = node
                result_init = stmt
                result_assign = s
                break
        if result_assign:
            break
    if result_assign:
        break

if result_assign is None:
    print(json.dumps({"success": False, "error": f"No derived assignment 'self.{target} = ...' found"}))
    sys.exit(0)

# Get the RHS expression text
if isinstance(result_assign, ast.Assign):
    rhs = ast.get_source_segment(source, result_assign.value)
    ann_text = None
else:
    rhs = ast.get_source_segment(source, result_assign.value)
    ann_text = ast.get_source_segment(source, result_assign.annotation) if result_assign.annotation else None

if rhs is None:
    print(json.dumps({"success": False, "error": "Could not extract RHS expression"}))
    sys.exit(0)

# Determine indentation from the class body
body_indent = " " * result_class.body[0].col_offset

# Build the @property getter
return_annotation = f" -> {ann_text}" if ann_text else ""
property_lines = [
    "\\n",
    f"{body_indent}@property\\n",
    f"{body_indent}def {target}(self){return_annotation}:\\n",
    f"{body_indent}    return {rhs}\\n",
]

# Remove the assignment line(s) from __init__
# Lines are 1-indexed in ast; Python list is 0-indexed
assign_start = result_assign.lineno - 1
assign_end = result_assign.end_lineno  # exclusive for slicing (end_lineno is 1-indexed)

new_lines = list(lines)
del new_lines[assign_start:assign_end]

# Re-parse to find the updated end of the class (line numbers shifted)
updated_source = "".join(new_lines)
try:
    updated_tree = ast.parse(updated_source)
except SyntaxError as e:
    print(json.dumps({"success": False, "error": f"Syntax error after removing assignment: {e}"}))
    sys.exit(0)

# Find the class end in the updated source
updated_class_end = None
for node in ast.walk(updated_tree):
    if isinstance(node, ast.ClassDef) and node.name == result_class.name:
        updated_class_end = node.end_lineno
        break

if updated_class_end is None:
    print(json.dumps({"success": False, "error": "Could not locate class after removal"}))
    sys.exit(0)

new_lines[updated_class_end:updated_class_end] = property_lines
new_source = "".join(new_lines)

try:
    ast.parse(new_source)
except SyntaxError as e:
    print(json.dumps({"success": False, "error": f"Generated invalid Python: {e}"}))
    sys.exit(0)

print(json.dumps({"success": True, "newSource": new_source}))
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
