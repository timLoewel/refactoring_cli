import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import type { PreconditionResult, RefactoringResult } from "../../core/refactoring.types.js";
import { definePythonRefactoring, pythonParam } from "../../python/python-refactoring-builder.js";
import type { PythonProjectContext } from "../../python/python-refactoring-builder.js";

export const parameterizeFunctionPython = definePythonRefactoring({
  name: "Parameterize Function (Python)",
  kebabName: "parameterize-function-python",
  tier: 2,
  description:
    "Adds a new parameter to a Python function and updates all call sites to pass None.",
  params: [
    pythonParam.file(),
    pythonParam.identifier("target", "Name of the function to add a parameter to"),
    pythonParam.identifier("paramName", "Name of the new parameter"),
    pythonParam.string("paramType", "Python type annotation for the new parameter", false),
  ],
  preconditions(ctx: PythonProjectContext, params: Record<string, unknown>): PreconditionResult {
    const errors: string[] = [];
    const file = params["file"] as string;
    const target = params["target"] as string;
    const paramName = params["paramName"] as string;

    const filePath = path.resolve(ctx.projectRoot, file);
    let source: string;
    try {
      source = readFileSync(filePath, "utf-8");
    } catch {
      errors.push(`File not found: ${file}`);
      return { ok: false, errors };
    }

    const result = validateFunction(source, target, paramName);
    if (!result.valid) {
      errors.push(result.error);
    }

    return { ok: errors.length === 0, errors };
  },
  apply(ctx: PythonProjectContext, params: Record<string, unknown>): RefactoringResult {
    const file = params["file"] as string;
    const target = params["target"] as string;
    const paramName = params["paramName"] as string;
    const paramType = params["paramType"] as string | undefined;

    const filePath = path.resolve(ctx.projectRoot, file);

    let source: string;
    try {
      source = readFileSync(filePath, "utf-8");
    } catch {
      return { success: false, filesChanged: [], description: `File not found: ${file}` };
    }

    const result = addParameter(source, target, paramName, paramType);

    if (!result.success) {
      return { success: false, filesChanged: [], description: result.error };
    }

    writeFileSync(filePath, result.newSource, "utf-8");

    const typeAnnotation = paramType ? `: ${paramType}` : "";
    return {
      success: true,
      filesChanged: [file],
      description: `Added parameter '${paramName}${typeAnnotation}' to function '${target}' and updated call sites`,
    };
  },
});

interface ValidateResult {
  valid: boolean;
  error: string;
}

function validateFunction(
  source: string,
  target: string,
  paramName: string,
): ValidateResult {
  const script = `
import ast
import sys
import json

source = sys.stdin.read()
target = ${JSON.stringify(target)}
param_name = ${JSON.stringify(paramName)}

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

# Check if parameter already exists
all_params = (
    target_func.args.posonlyargs +
    target_func.args.args +
    target_func.args.kwonlyargs
)
for p in all_params:
    if p.arg == param_name:
        print(json.dumps({"valid": False, "error": f"Function '{target}' already has a parameter named '{param_name}'"}))
        sys.exit(0)

if target_func.args.vararg and target_func.args.vararg.arg == param_name:
    print(json.dumps({"valid": False, "error": f"Function '{target}' already has a parameter named '{param_name}'"}))
    sys.exit(0)

if target_func.args.kwarg and target_func.args.kwarg.arg == param_name:
    print(json.dumps({"valid": False, "error": f"Function '{target}' already has a parameter named '{param_name}'"}))
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

function addParameter(
  source: string,
  target: string,
  paramName: string,
  paramType: string | undefined,
): TransformResult {
  const script = `
import ast
import sys
import json

source = sys.stdin.read()
target = ${JSON.stringify(target)}
param_name = ${JSON.stringify(paramName)}
param_type = ${JSON.stringify(paramType ?? "")}

tree = ast.parse(source)
lines = source.splitlines(True)

# Find all function definitions with the target name (handles overloads/redefinitions)
target_funcs = []
for node in ast.walk(tree):
    if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
        if node.name == target:
            target_funcs.append(node)

if not target_funcs:
    print(json.dumps({"success": False, "error": f"Function '{target}' not found"}))
    sys.exit(0)

# Find all call sites for the target function
call_sites = []
for node in ast.walk(tree):
    if isinstance(node, ast.Call):
        # Direct call: target(...)
        if isinstance(node.func, ast.Name) and node.func.id == target:
            call_sites.append(node)
        # Method call: self.target(...) or obj.target(...)
        elif isinstance(node.func, ast.Attribute) and node.func.attr == target:
            call_sites.append(node)

# Build edits (line, col_start, col_end, replacement) — apply in reverse order
edits = []

for func in target_funcs:
    args = func.args
    # Build the new parameter text with = None default
    new_param = param_name
    if param_type:
        new_param = f"{param_name}: {param_type} = None"
    else:
        new_param = f"{param_name}=None"

    # Insert after the last regular (non-keyword-only, non-*args, non-**kwargs) param
    # This avoids inserting into the keyword-only section
    regular_params = args.posonlyargs + args.args
    if regular_params:
        last_param = regular_params[-1]
        # Find end of the last parameter (including annotation and default)
        # Check if this param has a default value
        # defaults align to the END of args list, so default for args[i] is
        # defaults[i - (len(args) - len(defaults))]
        param_idx = len(args.posonlyargs) + args.args.index(last_param) if last_param in args.args else args.posonlyargs.index(last_param)
        total_regular = len(args.posonlyargs) + len(args.args)
        default_offset = param_idx - (total_regular - len(args.defaults))
        has_default = default_offset >= 0 and default_offset < len(args.defaults)

        if has_default:
            default_node = args.defaults[default_offset]
            end_line = default_node.end_lineno
            end_col = default_node.end_col_offset
        elif last_param.annotation:
            end_line = last_param.annotation.end_lineno
            end_col = last_param.annotation.end_col_offset
        else:
            end_line = last_param.end_lineno
            end_col = last_param.end_col_offset

        insert_text = f", {new_param}"
        edits.append((end_line, end_col, end_col, insert_text))
    elif args.vararg or args.kwonlyargs or args.kwarg:
        # No regular params but has *args/**kwargs/kwonly — insert before them
        func_line = lines[func.lineno - 1]
        paren_idx = func_line.index("(", func.col_offset)
        edits.append((func.lineno, paren_idx + 1, paren_idx + 1, f"{new_param}, "))
    else:
        # No parameters at all
        func_line = lines[func.lineno - 1]
        paren_idx = func_line.index("(", func.col_offset)
        edits.append((func.lineno, paren_idx + 1, paren_idx + 1, new_param))

# Update call sites — always use keyword form to avoid positional ambiguity
for call in call_sites:
    new_arg_text = f"{param_name}=None"
    if call.args or call.keywords:
        last_nodes = list(call.args) + list(call.keywords)
        last_node = max(last_nodes, key=lambda n: (n.end_lineno, n.end_col_offset))
        end_line = last_node.end_lineno
        end_col = last_node.end_col_offset
        edits.append((end_line, end_col, end_col, f", {new_arg_text}"))
    else:
        # No arguments — insert inside empty parens
        call_end_line = call.end_lineno
        call_end_col = call.end_col_offset
        edits.append((call_end_line, call_end_col - 1, call_end_col - 1, new_arg_text))

# Sort edits in reverse order (by line desc, then col desc) to avoid offset shifting
edits.sort(key=lambda e: (e[0], e[1]), reverse=True)

for line_no, col_start, col_end, replacement in edits:
    line_idx = line_no - 1
    line = lines[line_idx]
    lines[line_idx] = line[:col_start] + replacement + line[col_end:]

new_source = "".join(lines)
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
