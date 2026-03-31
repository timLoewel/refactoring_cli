import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import type { PreconditionResult, RefactoringResult } from "../../core/refactoring.types.js";
import { definePythonRefactoring, pythonParam } from "../../python/python-refactoring-builder.js";
import type { PythonProjectContext } from "../../python/python-refactoring-builder.js";

export const preserveWholeObjectPython = definePythonRefactoring({
  name: "Preserve Whole Object (Python)",
  kebabName: "preserve-whole-object-python",
  tier: 2,
  description:
    "Replaces multiple parameters derived from one object with the whole object passed as a single parameter.",
  params: [
    pythonParam.file(),
    pythonParam.identifier("target", "Name of the function to modify"),
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

    const result = validateFunction(source, target);
    if (!result.valid) {
      errors.push(result.error);
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

    const result = preserveWholeObject(source, target);

    if (!result.success) {
      return { success: false, filesChanged: [], description: result.error };
    }

    writeFileSync(filePath, result.newSource, "utf-8");

    return {
      success: true,
      filesChanged: [file],
      description: `Replaced individual parameters of '${target}' with a single object parameter`,
    };
  },
});

interface ValidateResult {
  valid: boolean;
  error: string;
}

function validateFunction(source: string, target: string): ValidateResult {
  const script = `
import ast
import sys
import json

source = sys.stdin.read()
target = ${JSON.stringify(target)}

tree = ast.parse(source)

target_func = None
for node in ast.walk(tree):
    if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
        if node.name == target:
            target_func = node
            break

if target_func is None:
    print(json.dumps({"valid": False, "error": f"Function '{target}' not found"}))
    sys.exit(0)

all_params = (
    target_func.args.posonlyargs +
    target_func.args.args +
    target_func.args.kwonlyargs
)
if len(all_params) < 2:
    print(json.dumps({"valid": False, "error": f"Function '{target}' must have at least 2 parameters"}))
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

function preserveWholeObject(source: string, target: string): TransformResult {
  const script = `
import ast
import sys
import json

source = sys.stdin.read()
target = ${JSON.stringify(target)}

tree = ast.parse(source)
lines = source.splitlines(True)

# Find the target function
target_func = None
for node in ast.walk(tree):
    if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
        if node.name == target:
            target_func = node
            break

if target_func is None:
    print(json.dumps({"success": False, "error": f"Function '{target}' not found"}))
    sys.exit(0)

all_params = (
    target_func.args.posonlyargs +
    target_func.args.args +
    target_func.args.kwonlyargs
)
if len(all_params) < 2:
    print(json.dumps({"success": False, "error": f"Function '{target}' must have at least 2 parameters"}))
    sys.exit(0)

param_names = [p.arg for p in all_params]

# Find call sites for the target function
call_sites = []
for node in ast.walk(tree):
    if isinstance(node, ast.Call):
        if isinstance(node.func, ast.Name) and node.func.id == target:
            call_sites.append(node)
        elif isinstance(node.func, ast.Attribute) and node.func.attr == target:
            call_sites.append(node)

# Analyze call sites to find common object prefix
# Look for patterns like obj.field1, obj.field2 in positional args
obj_name = None
for call in call_sites:
    if len(call.args) != len(param_names):
        continue
    # Check if all args are attribute accesses on the same object
    candidate = None
    all_attr = True
    for arg in call.args:
        if isinstance(arg, ast.Attribute) and isinstance(arg.value, ast.Name):
            if candidate is None:
                candidate = arg.value.id
            elif arg.value.id != candidate:
                all_attr = False
                break
        else:
            all_attr = False
            break
    if all_attr and candidate is not None:
        obj_name = candidate
        break

if obj_name is None:
    obj_name = "obj"

edits = []

# 1. Replace function parameters with single object parameter
func_line = lines[target_func.lineno - 1]
open_paren_col = func_line.index("(", target_func.col_offset)
open_paren_offset = sum(len(lines[i]) for i in range(target_func.lineno - 1)) + open_paren_col

paren_depth = 0
close_paren_offset = None
for idx in range(open_paren_offset, len(source)):
    ch = source[idx]
    if ch == "(":
        paren_depth += 1
    elif ch == ")":
        paren_depth -= 1
        if paren_depth == 0:
            close_paren_offset = idx
            break

if close_paren_offset is None:
    print(json.dumps({"success": False, "error": "Could not find closing parenthesis"}))
    sys.exit(0)

edits.append((open_paren_offset + 1, close_paren_offset, obj_name))

# 2. Replace usages of individual param names with obj.param_name in function body
body = target_func.body
name_nodes = []
for node in ast.walk(target_func):
    if isinstance(node, ast.Name) and node.id in param_names:
        # Skip parameter definitions themselves
        is_param_def = False
        for p in all_params:
            if node.lineno == p.lineno and node.col_offset == p.col_offset:
                is_param_def = True
                break
        if not is_param_def:
            offset = sum(len(lines[i]) for i in range(node.lineno - 1)) + node.col_offset
            end_offset = sum(len(lines[i]) for i in range(node.end_lineno - 1)) + node.end_col_offset
            name_nodes.append((offset, end_offset, f"{obj_name}.{node.id}"))

edits.extend(name_nodes)

# 3. Update call sites: replace individual args with the whole object
for call in call_sites:
    if not call.args:
        continue

    # Check if args are attribute accesses on the same object
    call_obj = None
    all_attr = True
    for arg in call.args:
        if isinstance(arg, ast.Attribute) and isinstance(arg.value, ast.Name):
            if call_obj is None:
                call_obj = arg.value.id
            elif arg.value.id != call_obj:
                all_attr = False
                break
        else:
            all_attr = False
            break

    if all_attr and call_obj is not None:
        # Replace all args with just the object name
        first_arg = call.args[0]
        last_arg = call.args[-1]
        start = sum(len(lines[i]) for i in range(first_arg.lineno - 1)) + first_arg.col_offset
        end = sum(len(lines[i]) for i in range(last_arg.end_lineno - 1)) + last_arg.end_col_offset
        edits.append((start, end, call_obj))

# Sort edits in reverse order to avoid offset shifting
edits.sort(key=lambda e: (e[0], e[1]), reverse=True)

new_source = source
for start, end, replacement in edits:
    new_source = new_source[:start] + replacement + new_source[end:]

print(json.dumps({
    "success": True,
    "newSource": new_source,
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
