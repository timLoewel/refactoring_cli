import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import type { PreconditionResult, RefactoringResult } from "../../core/refactoring.types.js";
import { definePythonRefactoring, pythonParam } from "../../python/python-refactoring-builder.js";
import type { PythonProjectContext } from "../../python/python-refactoring-builder.js";

export const changeValueToReferencePython = definePythonRefactoring({
  name: "Change Value To Reference (Python)",
  kebabName: "change-value-to-reference-python",
  tier: 3,
  description:
    "Converts a value object into a reference object by adding a class-level registry and a get_instance() factory classmethod.",
  params: [
    pythonParam.file(),
    pythonParam.identifier("target", "Name of the class to convert to reference semantics"),
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

    const result = validateChangeValueToReference(source, target);
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

    const result = applyChangeValueToReference(source, target);
    if (!result.success) {
      return { success: false, filesChanged: [], description: result.error };
    }

    writeFileSync(filePath, result.newSource, "utf-8");

    return {
      success: true,
      filesChanged: [file],
      description: `Added get_instance() factory with registry to class '${target}' for reference semantics`,
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

function validateChangeValueToReference(source: string, target: string): ValidationResult {
  const script = `
import ast, json, sys

source = sys.stdin.read()
target = ${JSON.stringify(target)}

try:
    tree = ast.parse(source)
except SyntaxError as e:
    print(json.dumps({"valid": False, "errors": [f"Syntax error: {e}"]}))
    sys.exit(0)

target_cls = None
for node in ast.walk(tree):
    if isinstance(node, ast.ClassDef) and node.name == target:
        target_cls = node
        break

if target_cls is None:
    print(json.dumps({"valid": False, "errors": [f"Class '{target}' not found"]}))
    sys.exit(0)

# Check if get_instance already exists
for stmt in ast.walk(target_cls):
    if isinstance(stmt, ast.FunctionDef) and stmt.name == "get_instance":
        print(json.dumps({"valid": False, "errors": [f"Class '{target}' already has get_instance()"]}))
        sys.exit(0)

print(json.dumps({"valid": True, "errors": []}))
`;

  try {
    const output = execFileSync("python3", ["-c", script], {
      encoding: "utf-8",
      input: source,
      timeout: 10_000,
    }).trim();

    const parsed = JSON.parse(output) as { valid: boolean; errors: string[] };
    return parsed;
  } catch (err) {
    return {
      valid: false,
      errors: [err instanceof Error ? err.message : String(err)],
    };
  }
}

function applyChangeValueToReference(source: string, target: string): TransformResult {
  const script = `
import ast, json, sys

source = sys.stdin.read()
target = ${JSON.stringify(target)}

tree = ast.parse(source)
lines = source.splitlines(True)

# Find the target class
target_cls = None
for node in ast.walk(tree):
    if isinstance(node, ast.ClassDef) and node.name == target:
        target_cls = node
        break

if target_cls is None:
    print(json.dumps({"success": False, "error": f"Class '{target}' not found"}))
    sys.exit(0)

# Find the key parameter: first parameter of __init__ after self
key_param = "key"
key_type = "str"
for stmt in target_cls.body:
    if isinstance(stmt, ast.FunctionDef) and stmt.name == "__init__":
        args = stmt.args.args
        # Skip 'self', take the first real param
        if len(args) > 1:
            first_param = args[1]
            key_param = first_param.arg
            if first_param.annotation is not None:
                ann_text = ast.get_source_segment(source, first_param.annotation)
                if ann_text:
                    key_type = ann_text
        break

body_indent = " " * target_cls.body[0].col_offset

# Build the registry class variable and get_instance classmethod
registry_lines = [
    "\\n",
    f"{body_indent}_instances: dict[{key_type}, \\"{target}\\"] = {{}}\\n",
    "\\n",
    f"{body_indent}@classmethod\\n",
    f"{body_indent}def get_instance(cls, {key_param}: {key_type}) -> \\"{target}\\":\\n",
    f"{body_indent}    if {key_param} not in cls._instances:\\n",
    f"{body_indent}        cls._instances[{key_param}] = cls({key_param})\\n",
    f"{body_indent}    return cls._instances[{key_param}]\\n",
]

new_lines = list(lines)
end_lineno = target_cls.end_lineno  # 1-indexed, insert at this 0-indexed position
new_lines[end_lineno:end_lineno] = registry_lines

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
