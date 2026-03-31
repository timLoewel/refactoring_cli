import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import type { PreconditionResult, RefactoringResult } from "../../core/refactoring.types.js";
import { definePythonRefactoring, pythonParam } from "../../python/python-refactoring-builder.js";
import type { PythonProjectContext } from "../../python/python-refactoring-builder.js";
import { parsePython } from "../../python/tree-sitter-parser.js";

export const changePythonFunctionDeclaration = definePythonRefactoring({
  name: "Change Function Declaration (Python)",
  kebabName: "change-function-declaration-python",
  tier: 2,
  description:
    "Renames a function parameter and updates all keyword argument call sites, handling positional-only, keyword-only, *args/**kwargs, @overload variants, and mutable defaults.",
  params: [
    pythonParam.file(),
    pythonParam.identifier("target", "Name of the function whose parameter to rename"),
    pythonParam.identifier("param_name", "Current name of the parameter"),
    pythonParam.identifier("new_param_name", "New name for the parameter"),
  ],
  preconditions(ctx: PythonProjectContext, params: Record<string, unknown>): PreconditionResult {
    const errors: string[] = [];
    const file = params["file"] as string;
    const target = params["target"] as string;
    const paramName = params["param_name"] as string;

    const filePath = path.resolve(ctx.projectRoot, file);
    let source: string;
    try {
      source = readFileSync(filePath, "utf-8");
    } catch {
      errors.push(`File not found: ${file}`);
      return { ok: false, errors };
    }

    const tree = parsePython(source);
    if (!hasFunctionDef(tree.rootNode, target)) {
      errors.push(`Function '${target}' not found in ${file}`);
    }

    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(paramName)) {
      errors.push(`'${paramName}' is not a valid Python identifier`);
    }

    return { ok: errors.length === 0, errors };
  },
  apply(ctx: PythonProjectContext, params: Record<string, unknown>): RefactoringResult {
    const file = params["file"] as string;
    const target = params["target"] as string;
    const paramName = params["param_name"] as string;
    const newParamName = params["new_param_name"] as string;

    const filePath = path.resolve(ctx.projectRoot, file);

    let source: string;
    try {
      source = readFileSync(filePath, "utf-8");
    } catch {
      return { success: false, filesChanged: [], description: `File not found: ${file}` };
    }

    const result = changeFunctionDeclaration(source, target, paramName, newParamName);

    if (!result.success) {
      return { success: false, filesChanged: [], description: result.error };
    }

    writeFileSync(filePath, result.newSource, "utf-8");

    return {
      success: true,
      filesChanged: [file],
      description: `Renamed parameter '${paramName}' to '${newParamName}' in function '${target}' (${result.editCount} edits)`,
    };
  },
});

interface ChangeResult {
  success: boolean;
  newSource: string;
  editCount: number;
  error: string;
}

function changeFunctionDeclaration(
  source: string,
  target: string,
  paramName: string,
  newParamName: string,
): ChangeResult {
  const script = `
import ast
import sys
import json

source = sys.stdin.read()
target = ${JSON.stringify(target)}
param_name = ${JSON.stringify(paramName)}
new_param_name = ${JSON.stringify(newParamName)}

tree = ast.parse(source)
lines = source.splitlines(True)

# Collect all function definitions matching the target name
# (includes @overload variants and the implementation)
func_nodes = []
for node in ast.walk(tree):
    if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
        if node.name == target:
            func_nodes.append(node)

if not func_nodes:
    print(json.dumps({"success": False, "error": f"Function '{target}' not found"}))
    sys.exit(0)

# Collect all edits: (line, col, end_col, replacement)
edits = []

for func_node in func_nodes:
    # Rename the parameter in the function signature
    for arg in func_node.args.args + func_node.args.posonlyargs + func_node.args.kwonlyargs:
        if arg.arg == param_name:
            edits.append((arg.lineno, arg.col_offset, arg.col_offset + len(param_name), new_param_name))

    # Also check *args and **kwargs names (unlikely but complete)
    if func_node.args.vararg and func_node.args.vararg.arg == param_name:
        a = func_node.args.vararg
        edits.append((a.lineno, a.col_offset, a.col_offset + len(param_name), new_param_name))
    if func_node.args.kwarg and func_node.args.kwarg.arg == param_name:
        a = func_node.args.kwarg
        edits.append((a.lineno, a.col_offset, a.col_offset + len(param_name), new_param_name))

    # Rename all references to the parameter inside the function body
    # (Name nodes with matching id that are in the function's scope)
    for node in ast.walk(func_node):
        if isinstance(node, ast.Name) and node.id == param_name:
            # Skip the parameter definition itself (already handled above)
            is_param_def = False
            for arg in func_node.args.args + func_node.args.posonlyargs + func_node.args.kwonlyargs:
                if arg.lineno == node.lineno and arg.col_offset == node.col_offset:
                    is_param_def = True
                    break
            if not is_param_def:
                edits.append((node.lineno, node.col_offset, node.end_col_offset, new_param_name))

# Rename keyword arguments at call sites throughout the file
for node in ast.walk(tree):
    if isinstance(node, ast.Call):
        # Check if this call is to the target function
        is_target_call = False
        if isinstance(node.func, ast.Name) and node.func.id == target:
            is_target_call = True
        elif isinstance(node.func, ast.Attribute) and node.func.attr == target:
            is_target_call = True

        if is_target_call:
            for kw in node.keywords:
                if kw.arg == param_name:
                    # Find the keyword name position in the source
                    # kw.value has position info; keyword name is before '='
                    kw_line = lines[kw.value.lineno - 1]
                    # Search backward from value position for the keyword name
                    val_col = kw.value.col_offset
                    prefix = kw_line[:val_col]
                    # Remove trailing '=' and whitespace
                    eq_idx = prefix.rstrip().rfind("=")
                    if eq_idx >= 0:
                        name_end = eq_idx
                        name_start = name_end - len(param_name)
                        if name_start >= 0 and kw_line[name_start:name_end] == param_name:
                            edits.append((kw.value.lineno, name_start, name_end, new_param_name))

if not edits:
    print(json.dumps({"success": False, "error": f"Parameter '{param_name}' not found in function '{target}'"}))
    sys.exit(0)

# Deduplicate edits
edits = list(set(edits))

# Apply edits in reverse order to maintain positions
edits.sort(key=lambda e: (e[0], e[1]), reverse=True)

for line_no, col, end_col, replacement in edits:
    line_idx = line_no - 1
    line = lines[line_idx]
    lines[line_idx] = line[:col] + replacement + line[end_col:]

new_source = "".join(lines)

print(json.dumps({
    "success": True,
    "newSource": new_source,
    "editCount": len(edits),
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
      editCount?: number;
      error?: string;
    };

    if (!parsed.success) {
      return { success: false, newSource: "", editCount: 0, error: parsed.error ?? "Unknown error" };
    }

    return {
      success: true,
      newSource: parsed.newSource ?? source,
      editCount: parsed.editCount ?? 0,
      error: "",
    };
  } catch (err) {
    return {
      success: false,
      newSource: "",
      editCount: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function hasFunctionDef(
  node: {
    type: string;
    text: string;
    childCount: number;
    child: (i: number) => typeof node | null;
  },
  name: string,
): boolean {
  if (node.type === "function_definition") {
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child && child.type === "identifier" && child.text === name) {
        return true;
      }
    }
  }
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child && hasFunctionDef(child, name)) return true;
  }
  return false;
}
