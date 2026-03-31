import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import type { PreconditionResult, RefactoringResult } from "../../core/refactoring.types.js";
import { definePythonRefactoring, pythonParam } from "../../python/python-refactoring-builder.js";
import type { PythonProjectContext } from "../../python/python-refactoring-builder.js";

export const removeMiddleManPython = definePythonRefactoring({
  name: "Remove Middle Man (Python)",
  kebabName: "remove-middle-man-python",
  tier: 3,
  description:
    "Removes methods that merely forward calls to a delegate field, exposing the delegate directly.",
  params: [
    pythonParam.file(),
    pythonParam.identifier("target", "Name of the class acting as middle man"),
    pythonParam.identifier("delegate", "Name of the delegate field whose methods are being forwarded"),
  ],
  preconditions(ctx: PythonProjectContext, params: Record<string, unknown>): PreconditionResult {
    const errors: string[] = [];
    const file = params["file"] as string;
    const target = params["target"] as string;
    const delegate = params["delegate"] as string;

    const filePath = path.resolve(ctx.projectRoot, file);
    let source: string;
    try {
      source = readFileSync(filePath, "utf-8");
    } catch {
      errors.push(`File not found: ${file}`);
      return { ok: false, errors };
    }

    const result = validateRemoveMiddleMan(source, target, delegate);
    if (!result.valid) {
      errors.push(...result.errors);
    }

    return { ok: errors.length === 0, errors };
  },
  apply(ctx: PythonProjectContext, params: Record<string, unknown>): RefactoringResult {
    const file = params["file"] as string;
    const target = params["target"] as string;
    const delegate = params["delegate"] as string;

    const filePath = path.resolve(ctx.projectRoot, file);

    let source: string;
    try {
      source = readFileSync(filePath, "utf-8");
    } catch {
      return { success: false, filesChanged: [], description: `File not found: ${file}` };
    }

    const result = applyRemoveMiddleMan(source, target, delegate);

    if (!result.success) {
      return { success: false, filesChanged: [], description: result.error };
    }

    writeFileSync(filePath, result.newSource, "utf-8");

    return {
      success: true,
      filesChanged: [file],
      description: result.description,
    };
  },
});

interface ValidateResult {
  valid: boolean;
  errors: string[];
}

function validateRemoveMiddleMan(
  source: string,
  target: string,
  delegate: string,
): ValidateResult {
  const script = `
import ast
import sys
import json

source = sys.stdin.read()
target_name = ${JSON.stringify(target)}
delegate_field = ${JSON.stringify(delegate)}

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
    # Check delegate field exists (self.field in __init__ or class-level annotation)
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
    else:
        # Check there is at least one delegating method to remove
        def is_delegating_method(func_node):
            # A delegating method has only a return statement (optionally after a docstring)
            # returning self.delegate.method(...)
            body = func_node.body
            stmts = [s for s in body if not (isinstance(s, ast.Expr) and isinstance(s.value, ast.Constant) and isinstance(s.value.value, str))]
            if len(stmts) != 1:
                return False
            stmt = stmts[0]
            if not isinstance(stmt, ast.Return):
                return False
            if stmt.value is None:
                return False
            val = stmt.value
            # Must be self.delegate.method(...)
            if not isinstance(val, ast.Call):
                return False
            func = val.func
            if not isinstance(func, ast.Attribute):
                return False
            obj = func.value
            if not isinstance(obj, ast.Attribute):
                return False
            if not (isinstance(obj.value, ast.Name) and obj.value.id == "self" and obj.attr == delegate_field):
                return False
            return True

        delegating_methods = [
            stmt.name for stmt in target_cls.body
            if isinstance(stmt, ast.FunctionDef) and stmt.name != "__init__" and is_delegating_method(stmt)
        ]

        if not delegating_methods:
            errors.append(f"No delegating methods found on class '{target_name}' for delegate '{delegate_field}'")

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
  description: string;
  error: string;
}

function applyRemoveMiddleMan(
  source: string,
  target: string,
  delegate: string,
): TransformResult {
  const script = `
import ast
import sys
import json

source = sys.stdin.read()
target_name = ${JSON.stringify(target)}
delegate_field = ${JSON.stringify(delegate)}

tree = ast.parse(source)
lines = source.splitlines(True)

# Find target class
target_cls = None
for node in ast.iter_child_nodes(tree):
    if isinstance(node, ast.ClassDef) and node.name == target_name:
        target_cls = node

if target_cls is None:
    print(json.dumps({"success": False, "newSource": "", "description": "", "error": f"Class '{target_name}' not found"}))
    sys.exit(0)

def is_delegating_method(func_node):
    body = func_node.body
    stmts = [s for s in body if not (isinstance(s, ast.Expr) and isinstance(s.value, ast.Constant) and isinstance(s.value.value, str))]
    if len(stmts) != 1:
        return False
    stmt = stmts[0]
    if not isinstance(stmt, ast.Return):
        return False
    if stmt.value is None:
        return False
    val = stmt.value
    if not isinstance(val, ast.Call):
        return False
    func = val.func
    if not isinstance(func, ast.Attribute):
        return False
    obj = func.value
    if not isinstance(obj, ast.Attribute):
        return False
    if not (isinstance(obj.value, ast.Name) and obj.value.id == "self" and obj.attr == delegate_field):
        return False
    return True

# Collect delegating methods to remove (sorted by line number descending)
delegating = [
    stmt for stmt in target_cls.body
    if isinstance(stmt, ast.FunctionDef) and stmt.name != "__init__" and is_delegating_method(stmt)
]
delegating_names = [m.name for m in delegating]

if not delegating:
    print(json.dumps({"success": False, "newSource": "", "description": "", "error": "No delegating methods found"}))
    sys.exit(0)

# Remove methods in reverse order to avoid line number drift
new_lines = list(lines)
for method in sorted(delegating, key=lambda m: m.lineno, reverse=True):
    # Determine the line range of the method
    # Include blank lines before the method (decorator-like separation)
    start = method.lineno - 1  # 0-indexed
    end = method.end_lineno    # exclusive end (0-indexed: end_lineno is 1-indexed)

    # Also remove blank lines immediately before the method
    while start > 0 and new_lines[start - 1].strip() == "":
        start -= 1

    del new_lines[start:end]

new_source = "".join(new_lines)
# Ensure file ends with single newline
new_source = new_source.rstrip() + "\\n"

description = f"Removed {len(delegating_names)} delegating method(s) [{', '.join(delegating_names)}] from '{target_name}', exposing delegate '{delegate_field}' directly"

print(json.dumps({"success": True, "newSource": new_source, "description": description, "error": ""}))
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
      description?: string;
      error?: string;
    };

    if (!parsed.success) {
      return { success: false, newSource: "", description: "", error: parsed.error ?? "Unknown error" };
    }

    return {
      success: true,
      newSource: parsed.newSource ?? source,
      description: parsed.description ?? "",
      error: "",
    };
  } catch (err) {
    return {
      success: false,
      newSource: "",
      description: "",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
