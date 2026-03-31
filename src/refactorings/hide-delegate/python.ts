import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import type { PreconditionResult, RefactoringResult } from "../../core/refactoring.types.js";
import { definePythonRefactoring, pythonParam } from "../../python/python-refactoring-builder.js";
import type { PythonProjectContext } from "../../python/python-refactoring-builder.js";

export const hideDelegatePython = definePythonRefactoring({
  name: "Hide Delegate (Python)",
  kebabName: "hide-delegate-python",
  tier: 3,
  description:
    "Adds a forwarding method to a class that delegates to a field, hiding the delegate from callers.",
  params: [
    pythonParam.file(),
    pythonParam.identifier("target", "Name of the class to add the delegating method to"),
    pythonParam.identifier("delegate", "Name of the delegate field on the target class"),
    pythonParam.identifier("method", "Name of the method on the delegate to expose"),
  ],
  preconditions(ctx: PythonProjectContext, params: Record<string, unknown>): PreconditionResult {
    const errors: string[] = [];
    const file = params["file"] as string;
    const target = params["target"] as string;
    const delegate = params["delegate"] as string;
    const method = params["method"] as string;

    const filePath = path.resolve(ctx.projectRoot, file);
    let source: string;
    try {
      source = readFileSync(filePath, "utf-8");
    } catch {
      errors.push(`File not found: ${file}`);
      return { ok: false, errors };
    }

    const result = validateHideDelegate(source, target, delegate, method);
    if (!result.valid) {
      errors.push(...result.errors);
    }

    return { ok: errors.length === 0, errors };
  },
  apply(ctx: PythonProjectContext, params: Record<string, unknown>): RefactoringResult {
    const file = params["file"] as string;
    const target = params["target"] as string;
    const delegate = params["delegate"] as string;
    const method = params["method"] as string;

    const filePath = path.resolve(ctx.projectRoot, file);

    let source: string;
    try {
      source = readFileSync(filePath, "utf-8");
    } catch {
      return { success: false, filesChanged: [], description: `File not found: ${file}` };
    }

    const result = applyHideDelegate(source, target, delegate, method);

    if (!result.success) {
      return { success: false, filesChanged: [], description: result.error };
    }

    writeFileSync(filePath, result.newSource, "utf-8");

    return {
      success: true,
      filesChanged: [file],
      description: `Added delegating method '${method}()' to class '${target}' hiding delegate field '${delegate}'`,
    };
  },
});

interface ValidateResult {
  valid: boolean;
  errors: string[];
}

function validateHideDelegate(
  source: string,
  target: string,
  delegate: string,
  method: string,
): ValidateResult {
  const script = `
import ast
import sys
import json

source = sys.stdin.read()
target_name = ${JSON.stringify(target)}
delegate_field = ${JSON.stringify(delegate)}
method_name = ${JSON.stringify(method)}

tree = ast.parse(source)
errors = []

# Find target class
target_cls = None
for node in ast.iter_child_nodes(tree):
    if isinstance(node, ast.ClassDef) and node.name == target_name:
        target_cls = node

if target_cls is None:
    errors.append(f"Class '{target_name}' not found")
else:
    # Check method doesn't already exist
    for stmt in target_cls.body:
        if isinstance(stmt, ast.FunctionDef) and stmt.name == method_name:
            errors.append(f"Method '{method_name}' already exists on class '{target_name}'")

    # Check delegate field exists (class-level annotation or self.field in __init__)
    has_delegate = False
    for stmt in target_cls.body:
        if isinstance(stmt, ast.AnnAssign):
            if isinstance(stmt.target, ast.Name) and stmt.target.id == delegate_field:
                has_delegate = True
        elif isinstance(stmt, ast.FunctionDef) and stmt.name == "__init__":
            for s in stmt.body:
                if isinstance(s, ast.Assign):
                    for t in s.targets:
                        if (isinstance(t, ast.Attribute) and isinstance(t.value, ast.Name)
                                and t.value.id == "self" and t.attr == delegate_field):
                            has_delegate = True
                elif isinstance(s, ast.AnnAssign):
                    if (isinstance(s.target, ast.Attribute)
                            and isinstance(s.target.value, ast.Name)
                            and s.target.value.id == "self"
                            and s.target.attr == delegate_field):
                        has_delegate = True

    if not has_delegate:
        errors.append(f"Delegate field '{delegate_field}' not found on class '{target_name}'")

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

interface TransformResult {
  success: boolean;
  newSource: string;
  error: string;
}

function applyHideDelegate(
  source: string,
  target: string,
  delegate: string,
  method: string,
): TransformResult {
  const script = `
import ast
import sys
import json

source = sys.stdin.read()
target_name = ${JSON.stringify(target)}
delegate_field = ${JSON.stringify(delegate)}
method_name = ${JSON.stringify(method)}

tree = ast.parse(source)
lines = source.splitlines(True)

# Collect all classes
all_classes = {}
for node in ast.iter_child_nodes(tree):
    if isinstance(node, ast.ClassDef):
        all_classes[node.name] = node

target_cls = all_classes.get(target_name)
if target_cls is None:
    print(json.dumps({"success": False, "newSource": "", "error": f"Class '{target_name}' not found"}))
    sys.exit(0)

# Determine body indentation from first statement
body_indent = "    "
if target_cls.body:
    first_line = lines[target_cls.body[0].lineno - 1]
    body_indent = first_line[:len(first_line) - len(first_line.lstrip())]
inner_indent = body_indent + "    "

# Find delegate field type annotation
delegate_type = None
for stmt in target_cls.body:
    if isinstance(stmt, ast.AnnAssign):
        if isinstance(stmt.target, ast.Name) and stmt.target.id == delegate_field:
            if isinstance(stmt.annotation, ast.Name):
                delegate_type = stmt.annotation.id
    elif isinstance(stmt, ast.FunctionDef) and stmt.name == "__init__":
        for s in stmt.body:
            if isinstance(s, ast.Assign):
                for t in s.targets:
                    if (isinstance(t, ast.Attribute) and isinstance(t.value, ast.Name)
                            and t.value.id == "self" and t.attr == delegate_field):
                        if isinstance(s.value, ast.Call) and isinstance(s.value.func, ast.Name):
                            delegate_type = s.value.func.id
            elif isinstance(s, ast.AnnAssign):
                if (isinstance(s.target, ast.Attribute)
                        and isinstance(s.target.value, ast.Name)
                        and s.target.value.id == "self"
                        and s.target.attr == delegate_field):
                    if isinstance(s.annotation, ast.Name):
                        delegate_type = s.annotation.id

# Find return type from delegate class if available
return_type = None
if delegate_type and delegate_type in all_classes:
    delegate_cls = all_classes[delegate_type]
    for stmt in delegate_cls.body:
        if isinstance(stmt, ast.FunctionDef) and stmt.name == method_name:
            if stmt.returns:
                return_type = ast.get_source_segment(source, stmt.returns)

# Build the new delegating method
if return_type:
    method_text = (
        f"{body_indent}def {method_name}(self) -> {return_type}:\\n"
        f"{inner_indent}return self.{delegate_field}.{method_name}()"
    )
else:
    method_text = (
        f"{body_indent}def {method_name}(self):\\n"
        f"{inner_indent}return self.{delegate_field}.{method_name}()"
    )

# Insert new method after the last statement in the target class
insert_at = target_cls.end_lineno  # 0-indexed: insert after this line (1-indexed end_lineno)
new_lines = list(lines)
new_lines.insert(insert_at, method_text + "\\n")
new_lines.insert(insert_at, "\\n")

new_source = "".join(new_lines)

# Ensure file ends with single newline
new_source = new_source.rstrip() + "\\n"

print(json.dumps({"success": True, "newSource": new_source, "error": ""}))
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
