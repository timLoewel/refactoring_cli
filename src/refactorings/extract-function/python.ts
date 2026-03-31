import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import type { PreconditionResult, RefactoringResult } from "../../core/refactoring.types.js";
import { definePythonRefactoring, pythonParam } from "../../python/python-refactoring-builder.js";
import type { PythonProjectContext } from "../../python/python-refactoring-builder.js";
import { parsePython } from "../../python/tree-sitter-parser.js";

export const extractPythonFunction = definePythonRefactoring({
  name: "Extract Function (Python)",
  kebabName: "extract-function-python",
  tier: 2,
  description:
    "Extracts a range of lines into a new named function and replaces them with a call to it.",
  params: [
    pythonParam.file(),
    pythonParam.number("startLine", "First line of code to extract (1-based)"),
    pythonParam.number("endLine", "Last line of code to extract (1-based)"),
    pythonParam.identifier("name", "Name for the extracted function"),
  ],
  preconditions(ctx: PythonProjectContext, params: Record<string, unknown>): PreconditionResult {
    const errors: string[] = [];
    const file = params["file"] as string;
    const startLine = params["startLine"] as number;
    const endLine = params["endLine"] as number;
    const name = params["name"] as string;

    const filePath = path.resolve(ctx.projectRoot, file);
    let source: string;
    try {
      source = readFileSync(filePath, "utf-8");
    } catch {
      errors.push(`File not found: ${file}`);
      return { ok: false, errors };
    }

    const tree = parsePython(source);
    if (tree.rootNode.hasError) {
      errors.push(`File has syntax errors: ${file}`);
    }

    if (endLine < startLine) {
      errors.push("param 'endLine' must be >= 'startLine'");
    }

    const totalLines = source.split("\n").length;
    if (startLine > totalLines) {
      errors.push(`startLine ${startLine} exceeds file length ${totalLines}`);
    }
    if (endLine > totalLines) {
      errors.push(`endLine ${endLine} exceeds file length ${totalLines}`);
    }

    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
      errors.push(`'${name}' is not a valid Python identifier`);
    }

    return { ok: errors.length === 0, errors };
  },
  apply(ctx: PythonProjectContext, params: Record<string, unknown>): RefactoringResult {
    const file = params["file"] as string;
    const startLine = params["startLine"] as number;
    const endLine = params["endLine"] as number;
    const name = params["name"] as string;

    const filePath = path.resolve(ctx.projectRoot, file);

    let source: string;
    try {
      source = readFileSync(filePath, "utf-8");
    } catch {
      return { success: false, filesChanged: [], description: `File not found: ${file}` };
    }

    const result = extractFunction(source, startLine, endLine, name);

    if (!result.success) {
      return { success: false, filesChanged: [], description: result.error };
    }

    writeFileSync(filePath, result.newSource, "utf-8");

    return {
      success: true,
      filesChanged: [file],
      description: `Extracted lines ${startLine}-${endLine} into function '${name}'`,
    };
  },
});

interface ExtractResult {
  success: boolean;
  newSource: string;
  error: string;
}

function extractFunction(
  source: string,
  startLine: number,
  endLine: number,
  name: string,
): ExtractResult {
  const script = `
import ast
import sys
import json
import textwrap

source = sys.stdin.read()
start_line = ${startLine}
end_line = ${endLine}
func_name = ${JSON.stringify(name)}

try:
    tree = ast.parse(source)
except SyntaxError as e:
    print(json.dumps({"success": False, "error": f"Syntax error: {e}"}))
    sys.exit(0)

lines = source.splitlines(True)
total_lines = len(lines)

if start_line < 1 or end_line > total_lines or start_line > end_line:
    print(json.dumps({"success": False, "error": f"Invalid line range {start_line}-{end_line}"}))
    sys.exit(0)

# Extract the lines (0-indexed)
extracted_lines = lines[start_line - 1:end_line]
extracted_text = "".join(extracted_lines)

# Find the minimum indentation of the extracted lines (ignoring blank lines)
min_indent = None
for line in extracted_lines:
    stripped = line.rstrip()
    if not stripped:
        continue
    indent = len(line) - len(line.lstrip())
    if min_indent is None or indent < min_indent:
        min_indent = indent

if min_indent is None:
    print(json.dumps({"success": False, "error": "No non-blank lines in range"}))
    sys.exit(0)

# Determine the indentation of the call site (same as extracted code's parent)
call_indent = " " * min_indent

# Determine if extracted code is inside a class method (check for self/cls usage)
# We'll analyze the enclosing function to detect this
enclosing_func = None
enclosing_class = None
for node in ast.walk(tree):
    if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
        if node.lineno <= start_line and node.end_lineno >= end_line:
            if enclosing_func is None or node.lineno > enclosing_func.lineno:
                enclosing_func = node
    if isinstance(node, ast.ClassDef):
        if node.lineno <= start_line and node.end_lineno >= end_line:
            if enclosing_class is None or node.lineno > enclosing_class.lineno:
                enclosing_class = node

is_method = enclosing_func is not None and enclosing_class is not None
# Check if extracted code uses 'self' or 'cls'
uses_self = False
uses_cls = False

# Parse just the extracted text to analyze variable usage
# We need to dedent it first to parse it as valid Python
dedented = textwrap.dedent(extracted_text)
try:
    extracted_tree = ast.parse(dedented)
except SyntaxError:
    # If it doesn't parse standalone, wrap in a function to handle indented blocks
    try:
        wrapped = "def _wrapper_():\\n" + textwrap.indent(dedented, "    ")
        extracted_tree = ast.parse(wrapped)
        # Unwrap: get the body of the wrapper function
        wrapper_func = extracted_tree.body[0]
        extracted_tree.body = wrapper_func.body
    except SyntaxError as e:
        print(json.dumps({"success": False, "error": f"Cannot parse extracted code: {e}"}))
        sys.exit(0)

# Analyze variable usage in the extracted code
class VarAnalyzer(ast.NodeVisitor):
    def __init__(self):
        self.reads = set()
        self.writes = set()
        self.has_yield = False
        self.has_await = False
        self.has_return = False

    def visit_Name(self, node):
        if isinstance(node.ctx, (ast.Store, ast.Del)):
            self.writes.add(node.id)
        elif isinstance(node.ctx, ast.Load):
            self.reads.add(node.id)
        self.generic_visit(node)

    def visit_Yield(self, node):
        self.has_yield = True
        self.generic_visit(node)

    def visit_YieldFrom(self, node):
        self.has_yield = True
        self.generic_visit(node)

    def visit_Await(self, node):
        self.has_await = True
        self.generic_visit(node)

    def visit_Return(self, node):
        self.has_return = True
        self.generic_visit(node)

analyzer = VarAnalyzer()
analyzer.visit(extracted_tree)

if "self" in analyzer.reads:
    uses_self = True
if "cls" in analyzer.reads:
    uses_cls = True

# Analyze the enclosing scope to find variables defined before the extracted range
vars_defined_before = set()
if enclosing_func:
    # Parameters of the enclosing function
    for arg in enclosing_func.args.args:
        vars_defined_before.add(arg.arg)
    for arg in enclosing_func.args.kwonlyargs:
        vars_defined_before.add(arg.arg)
    if enclosing_func.args.vararg:
        vars_defined_before.add(enclosing_func.args.vararg.arg)
    if enclosing_func.args.kwarg:
        vars_defined_before.add(enclosing_func.args.kwarg.arg)

    # Assignments before the extracted range
    class PreAssignFinder(ast.NodeVisitor):
        def __init__(self):
            self.defined = set()

        def visit_Assign(self, node):
            if node.end_lineno < start_line:
                for target in node.targets:
                    if isinstance(target, ast.Name):
                        self.defined.add(target.id)
                    elif isinstance(target, ast.Tuple):
                        for elt in target.elts:
                            if isinstance(elt, ast.Name):
                                self.defined.add(elt.id)
            self.generic_visit(node)

        def visit_AnnAssign(self, node):
            if node.end_lineno < start_line:
                if isinstance(node.target, ast.Name):
                    self.defined.add(node.target.id)
            self.generic_visit(node)

        def visit_For(self, node):
            if node.lineno < start_line:
                if isinstance(node.target, ast.Name):
                    self.defined.add(node.target.id)
            self.generic_visit(node)

    pre_finder = PreAssignFinder()
    pre_finder.visit(enclosing_func)
    vars_defined_before |= pre_finder.defined
else:
    # Module level — check all assignments before start_line
    for node in ast.walk(tree):
        if isinstance(node, ast.Assign) and node.end_lineno < start_line:
            for target in node.targets:
                if isinstance(target, ast.Name):
                    vars_defined_before.add(target.id)
        elif isinstance(node, ast.AnnAssign) and node.end_lineno < start_line:
            if isinstance(node.target, ast.Name):
                vars_defined_before.add(node.target.id)

# Parameters for the new function: variables read that come from the outer scope
# This includes variables that are both read and written (e.g., total = total + item)
# Exclude builtins and 'self'/'cls'
builtins_set = set(dir(__builtins__)) if isinstance(__builtins__, dict) else set(dir(__builtins__))
params_needed = sorted(
    (analyzer.reads & vars_defined_before) - {"self", "cls"} - builtins_set
)

# Variables that are written in the extracted code and read after (need to be returned)
# Check what variables are used after the extracted range
vars_used_after = set()
if enclosing_func:
    class PostUsageFinder(ast.NodeVisitor):
        def __init__(self):
            self.used = set()

        def visit_Name(self, node):
            if isinstance(node.ctx, ast.Load) and node.lineno > end_line:
                self.used.add(node.id)
            self.generic_visit(node)

    post_finder = PostUsageFinder()
    post_finder.visit(enclosing_func)
    vars_used_after = post_finder.used

returns_needed = sorted(analyzer.writes & vars_used_after - {"self", "cls"})

# Build the new function
# Determine function indentation — place at enclosing scope level
if is_method and enclosing_class:
    # Method in a class — indent at class body level
    func_indent = " " * (enclosing_class.col_offset + 4)
elif enclosing_func:
    # Nested function — indent at enclosing function body level
    func_indent = " " * enclosing_func.col_offset
else:
    # Module level
    func_indent = ""

# Build parameter list
param_list = []
if is_method and uses_self:
    param_list.append("self")
elif is_method and uses_cls:
    param_list.append("cls")
param_list.extend(params_needed)
param_str = ", ".join(param_list)

# Determine if async
is_async = analyzer.has_await or (enclosing_func and isinstance(enclosing_func, ast.AsyncFunctionDef) and analyzer.has_await)

# Build function definition
if is_async:
    func_def = f"{func_indent}async def {func_name}({param_str}):"
else:
    func_def = f"{func_indent}def {func_name}({param_str}):"

# Re-indent the extracted code for the function body
body_indent = func_indent + "    "
# Remove the common indentation, then add the new body indentation
body_lines = []
for line in extracted_lines:
    stripped = line.rstrip("\\n").rstrip("\\r")
    if not stripped.strip():
        body_lines.append("")
    else:
        # Remove min_indent, add body_indent
        if len(stripped) >= min_indent:
            body_lines.append(body_indent + stripped[min_indent:])
        else:
            body_lines.append(body_indent + stripped.lstrip())

# Add return statement if needed
if returns_needed and not analyzer.has_return:
    if len(returns_needed) == 1:
        body_lines.append(f"{body_indent}return {returns_needed[0]}")
    else:
        body_lines.append(f"{body_indent}return {', '.join(returns_needed)}")

body_text = "\\n".join(body_lines)
func_text = f"{func_def}\\n{body_text}"

# Build the call site
call_args = ", ".join(params_needed)
if is_method and uses_self:
    call_prefix = "self."
elif is_method and uses_cls:
    call_prefix = "cls."
else:
    call_prefix = ""
if is_async:
    call_expr = f"await {call_prefix}{func_name}({call_args})"
else:
    call_expr = f"{call_prefix}{func_name}({call_args})"

# Build the replacement line(s) at the call site
if returns_needed and not analyzer.has_return:
    if len(returns_needed) == 1:
        call_line = f"{call_indent}{returns_needed[0]} = {call_expr}"
    else:
        call_line = f"{call_indent}{', '.join(returns_needed)} = {call_expr}"
else:
    call_line = f"{call_indent}{call_expr}"

# Assemble the new source
new_lines = []

# Lines before the extracted range
new_lines.extend(lines[:start_line - 1])

# The call line (replacing the extracted lines)
new_lines.append(call_line + "\\n")

# Lines after the extracted range
new_lines.extend(lines[end_line:])

# Find where to insert the new function definition
# Insert it after the enclosing function/class, or at end of file for module-level
new_source = "".join(new_lines)

# Find insertion point for the new function
if enclosing_func and not is_method:
    # Insert after the enclosing function
    insert_after_line = enclosing_func.end_lineno
    # Adjust for removed lines
    lines_removed = end_line - start_line + 1
    lines_added = 1  # the call line
    adjust = lines_added - lines_removed
    insert_after_line += adjust
    final_lines = new_source.splitlines(True)
    final_lines.insert(insert_after_line, "\\n" + func_text + "\\n\\n")
    new_source = "".join(final_lines)
elif is_method and enclosing_func:
    # Insert as a new method in the class, after the enclosing method
    insert_after_line = enclosing_func.end_lineno
    lines_removed = end_line - start_line + 1
    lines_added = 1
    adjust = lines_added - lines_removed
    insert_after_line += adjust
    final_lines = new_source.splitlines(True)
    final_lines.insert(insert_after_line, "\\n" + func_text + "\\n")
    new_source = "".join(final_lines)
else:
    # Module level: append at end
    if not new_source.endswith("\\n"):
        new_source += "\\n"
    new_source += "\\n" + func_text + "\\n"

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

    return {
      success: true,
      newSource: parsed.newSource ?? source,
      error: "",
    };
  } catch (err) {
    return {
      success: false,
      newSource: "",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
