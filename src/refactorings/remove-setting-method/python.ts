import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import type { PreconditionResult, RefactoringResult } from "../../core/refactoring.types.js";
import { definePythonRefactoring, pythonParam } from "../../python/python-refactoring-builder.js";
import type { PythonProjectContext } from "../../python/python-refactoring-builder.js";

export const removeSettingMethodPython = definePythonRefactoring({
  name: "Remove Setting Method (Python)",
  kebabName: "remove-setting-method-python",
  tier: 2,
  description:
    "Removes a @property.setter from a class, making the property read-only (only the getter remains).",
  params: [
    pythonParam.file(),
    pythonParam.identifier("target", "Name of the class containing the setter"),
    pythonParam.identifier("field", "Name of the property whose setter should be removed"),
  ],
  preconditions(ctx: PythonProjectContext, params: Record<string, unknown>): PreconditionResult {
    const errors: string[] = [];
    const file = params["file"] as string;
    const target = params["target"] as string;
    const field = params["field"] as string;

    const filePath = path.resolve(ctx.projectRoot, file);
    let source: string;
    try {
      source = readFileSync(filePath, "utf-8");
    } catch {
      errors.push(`File not found: ${file}`);
      return { ok: false, errors };
    }

    const result = validateRemoveSettingMethod(source, target, field);
    if (!result.valid) {
      errors.push(...result.errors);
    }

    return { ok: errors.length === 0, errors };
  },
  apply(ctx: PythonProjectContext, params: Record<string, unknown>): RefactoringResult {
    const file = params["file"] as string;
    const target = params["target"] as string;
    const field = params["field"] as string;

    const filePath = path.resolve(ctx.projectRoot, file);
    let source: string;
    try {
      source = readFileSync(filePath, "utf-8");
    } catch {
      return { success: false, filesChanged: [], description: `File not found: ${file}` };
    }

    const result = applyRemoveSettingMethod(source, target, field);
    if (!result.success) {
      return { success: false, filesChanged: [], description: result.error };
    }

    writeFileSync(filePath, result.newSource, "utf-8");

    return {
      success: true,
      filesChanged: [file],
      description: `Removed @${field}.setter from class '${target}', making '${field}' read-only`,
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

function validateRemoveSettingMethod(
  source: string,
  target: string,
  field: string,
): ValidationResult {
  const script = `
import ast, json, sys

source = sys.stdin.read()
target = ${JSON.stringify(target)}
field = ${JSON.stringify(field)}

try:
    tree = ast.parse(source)
except SyntaxError as e:
    print(json.dumps({"valid": False, "errors": [f"Syntax error: {e}"]}))
    sys.exit(0)

# Find the target class
target_cls = None
for node in ast.walk(tree):
    if isinstance(node, ast.ClassDef) and node.name == target:
        target_cls = node
        break

if target_cls is None:
    print(json.dumps({"valid": False, "errors": [f"Class '{target}' not found"]}))
    sys.exit(0)

# Look for a setter decorator: @field.setter on a method named field
found_setter = False
for stmt in target_cls.body:
    if not isinstance(stmt, ast.FunctionDef) or stmt.name != field:
        continue
    for deco in stmt.decorator_list:
        if (
            isinstance(deco, ast.Attribute)
            and isinstance(deco.value, ast.Name)
            and deco.value.id == field
            and deco.attr == "setter"
        ):
            found_setter = True
            break
    if found_setter:
        break

if not found_setter:
    print(json.dumps({"valid": False, "errors": [f"No @{field}.setter found in class '{target}'"]}))
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

function applyRemoveSettingMethod(source: string, target: string, field: string): TransformResult {
  const script = `
import ast, json, sys

source = sys.stdin.read()
target = ${JSON.stringify(target)}
field = ${JSON.stringify(field)}

tree = ast.parse(source)
lines = source.splitlines(True)

# Find the setter method node
setter_node = None
for node in ast.walk(tree):
    if not isinstance(node, ast.ClassDef) or node.name != target:
        continue
    for stmt in node.body:
        if not isinstance(stmt, ast.FunctionDef) or stmt.name != field:
            continue
        for deco in stmt.decorator_list:
            if (
                isinstance(deco, ast.Attribute)
                and isinstance(deco.value, ast.Name)
                and deco.value.id == field
                and deco.attr == "setter"
            ):
                setter_node = stmt
                break
        if setter_node:
            break
    if setter_node:
        break

if setter_node is None:
    print(json.dumps({"success": False, "error": f"No @{field}.setter found in class '{target}'"}))
    sys.exit(0)

# The decorator start line is the first decorator's lineno
# The method itself ends at setter_node.end_lineno
deco_start = setter_node.decorator_list[0].lineno - 1  # 0-indexed
method_end = setter_node.end_lineno  # exclusive (1-indexed end == 0-indexed exclusive)

new_lines = list(lines)
del new_lines[deco_start:method_end]
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
