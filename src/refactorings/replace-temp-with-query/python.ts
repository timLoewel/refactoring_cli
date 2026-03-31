import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import type { PreconditionResult, RefactoringResult } from "../../core/refactoring.types.js";
import { definePythonRefactoring, pythonParam } from "../../python/python-refactoring-builder.js";
import type { PythonProjectContext } from "../../python/python-refactoring-builder.js";

export const replaceTempWithQueryPython = definePythonRefactoring({
  name: "Replace Temp with Query (Python)",
  kebabName: "replace-temp-with-query-python",
  tier: 1,
  description:
    "Replaces a temporary variable with a call to a new extracted query function that computes the same value.",
  params: [
    pythonParam.file(),
    pythonParam.identifier("target", "Name of the temporary variable to replace"),
    pythonParam.identifier("name", "Name for the new query function"),
  ],
  preconditions(ctx: PythonProjectContext, params: Record<string, unknown>): PreconditionResult {
    const errors: string[] = [];
    const file = params["file"] as string;

    const filePath = path.resolve(ctx.projectRoot, file);
    try {
      readFileSync(filePath, "utf-8");
    } catch {
      errors.push(`File not found: ${file}`);
    }

    return { ok: errors.length === 0, errors };
  },
  apply(ctx: PythonProjectContext, params: Record<string, unknown>): RefactoringResult {
    const file = params["file"] as string;
    const target = params["target"] as string;
    const name = params["name"] as string;

    const filePath = path.resolve(ctx.projectRoot, file);

    let source: string;
    try {
      source = readFileSync(filePath, "utf-8");
    } catch {
      return { success: false, filesChanged: [], description: `File not found: ${file}` };
    }

    const result = replaceTempWithQuery(source, target, name);

    if (!result.success) {
      return { success: false, filesChanged: [], description: result.error };
    }

    writeFileSync(filePath, result.newSource, "utf-8");

    return {
      success: true,
      filesChanged: [file],
      description: `Replaced temp variable '${target}' with query function '${name}()'`,
    };
  },
});

interface TransformResult {
  success: boolean;
  newSource: string;
  error: string;
}

function replaceTempWithQuery(source: string, target: string, funcName: string): TransformResult {
  const script = `
import ast
import sys
import json

source = sys.stdin.read()
target = ${JSON.stringify(target)}
func_name = ${JSON.stringify(funcName)}

tree = ast.parse(source)
lines = source.splitlines(True)

def get_offset(lineno, col):
    return sum(len(lines[i]) for i in range(lineno - 1)) + col

def get_text(node):
    start = get_offset(node.lineno, node.col_offset)
    end = get_offset(node.end_lineno, node.end_col_offset)
    return source[start:end]

def get_indent(node):
    line = lines[node.lineno - 1]
    indent = ""
    for ch in line:
        if ch in (" ", "\\t"):
            indent += ch
        else:
            break
    return indent

def collect_names_in_expr(node):
    """Collect all Name nodes (Load context) in an expression."""
    names = set()
    for n in ast.walk(node):
        if isinstance(n, ast.Name) and isinstance(n.ctx, ast.Load):
            names.add(n.id)
    return names

def get_func_params(func_node):
    """Get the set of parameter names for a function."""
    params = set()
    if func_node is None:
        return params
    args = func_node.args
    for a in args.args + args.posonlyargs + args.kwonlyargs:
        params.add(a.arg)
    if args.vararg:
        params.add(args.vararg.arg)
    if args.kwarg:
        params.add(args.kwarg.arg)
    return params

# Find the containing function and the assignment
class AssignFinder(ast.NodeVisitor):
    def __init__(self):
        self.assign_node = None
        self.value_node = None
        self.value_text = None
        self.type_annotation = None
        self.containing_func = None
        self.scope = []
        self.target_scope = None
        self.references = []
        self.walrus_node = None

    def visit_FunctionDef(self, node):
        old_len = len(self.scope)
        self.scope.append(node)
        self.generic_visit(node)
        self.scope[:] = self.scope[:old_len]

    visit_AsyncFunctionDef = visit_FunctionDef

    def visit_Assign(self, node):
        if self.assign_node is None and self.walrus_node is None:
            for t in node.targets:
                if isinstance(t, ast.Name) and t.id == target:
                    self.assign_node = node
                    self.value_node = node.value
                    self.value_text = get_text(node.value)
                    self.target_scope = tuple(self.scope)
                    if self.scope:
                        self.containing_func = self.scope[-1]
                    break
        self.generic_visit(node)

    def visit_AnnAssign(self, node):
        if self.assign_node is None and self.walrus_node is None:
            if isinstance(node.target, ast.Name) and node.target.id == target and node.value:
                self.assign_node = node
                self.value_node = node.value
                self.value_text = get_text(node.value)
                self.target_scope = tuple(self.scope)
                if node.annotation:
                    self.type_annotation = get_text(node.annotation)
                if self.scope:
                    self.containing_func = self.scope[-1]
        self.generic_visit(node)

    def visit_NamedExpr(self, node):
        if self.assign_node is None and self.walrus_node is None:
            if isinstance(node.target, ast.Name) and node.target.id == target:
                self.walrus_node = node
                self.value_node = node.value
                self.value_text = get_text(node.value)
                self.target_scope = tuple(self.scope)
                if self.scope:
                    self.containing_func = self.scope[-1]
        self.generic_visit(node)

    def visit_Name(self, node):
        if node.id == target and isinstance(node.ctx, ast.Load):
            self.references.append(node)
        self.generic_visit(node)

finder = AssignFinder()
finder.visit(tree)

if finder.assign_node is None and finder.walrus_node is None:
    print(json.dumps({"success": False, "error": f"No assignment found for '{target}'"}))
    sys.exit(0)

value_text = finder.value_text
value_node = finder.value_node
type_ann = finder.type_annotation
containing_func = finder.containing_func
assign = finder.assign_node
walrus = finder.walrus_node

# Find free variables in the value expression that need to become parameters
expr_names = collect_names_in_expr(value_node)
# Remove builtins
import builtins
builtin_names = set(dir(builtins))
expr_names -= builtin_names
# Remove the target variable itself
expr_names.discard(target)
# Keep only names that are local to the containing function (params or local vars)
# These need to become parameters of the query function
free_vars = sorted(expr_names)  # sort for deterministic output

# Filter references to same scope — exclude the assignment target itself
references = []
for ref in finder.references:
    if assign:
        if isinstance(assign, ast.Assign):
            skip = False
            for t in assign.targets:
                if isinstance(t, ast.Name) and ref.lineno == t.lineno and ref.col_offset == t.col_offset:
                    skip = True
                    break
            if skip:
                continue
            references.append(ref)
            continue
        elif isinstance(assign, ast.AnnAssign):
            t = assign.target
            if ref.lineno == t.lineno and ref.col_offset == t.col_offset:
                continue
            references.append(ref)
            continue
    if walrus:
        wt = walrus.target
        if ref.lineno == wt.lineno and ref.col_offset == wt.col_offset:
            continue
    references.append(ref)

if not references:
    print(json.dumps({"success": False, "error": f"Variable '{target}' has no references to replace"}))
    sys.exit(0)

# Build the query function
if containing_func:
    func_indent = get_indent(containing_func)
else:
    func_indent = ""

# Build parameter list and call argument list
param_list = ", ".join(free_vars)
arg_list = ", ".join(free_vars)

# Build return type annotation
return_ann = ""
if type_ann:
    return_ann = f" -> {type_ann}"

call_expr = f"{func_name}({arg_list})" if free_vars else f"{func_name}()"
query_func = f"{func_indent}def {func_name}({param_list}){return_ann}:\\n{func_indent}    return {value_text}\\n\\n"

# Apply edits in reverse order of position
edits = []

# Replace all references with func_name(args)
for ref in references:
    start = get_offset(ref.lineno, ref.col_offset)
    end = get_offset(ref.end_lineno, ref.end_col_offset)
    edits.append((start, end, call_expr))

# Remove the assignment line (or replace walrus with just the function call)
if assign:
    assign_start_line = assign.lineno - 1
    assign_end_line = assign.end_lineno
    line_start = sum(len(lines[i]) for i in range(assign_start_line))
    line_end = sum(len(lines[i]) for i in range(assign_end_line))
    edits.append((line_start, line_end, ""))
elif walrus:
    walrus_start = get_offset(walrus.lineno, walrus.col_offset)
    walrus_end = get_offset(walrus.end_lineno, walrus.end_col_offset)
    edits.append((walrus_start, walrus_end, call_expr))

# Sort edits in reverse order
edits.sort(key=lambda e: e[0], reverse=True)

new_source = source
for start, end, replacement in edits:
    new_source = new_source[:start] + replacement + new_source[end:]

# Insert the query function before the containing function
if containing_func:
    insert_pos = sum(len(lines[i]) for i in range(containing_func.lineno - 1))
else:
    insert_pos = 0

new_source = new_source[:insert_pos] + query_func + new_source[insert_pos:]

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
