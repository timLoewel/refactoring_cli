import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import type { PreconditionResult, RefactoringResult } from "../../core/refactoring.types.js";
import { definePythonRefactoring, pythonParam } from "../../python/python-refactoring-builder.js";
import type { PythonProjectContext } from "../../python/python-refactoring-builder.js";

export const replaceLoopWithPipelinePython = definePythonRefactoring({
  name: "Replace Loop with Pipeline (Python)",
  kebabName: "replace-loop-with-pipeline-python",
  tier: 2,
  description:
    "Replaces a for-loop that builds a collection into an equivalent comprehension or pipeline expression.",
  params: [
    pythonParam.file(),
    pythonParam.number("target", "Line number of the for-loop to replace (1-based)"),
  ],
  preconditions(ctx: PythonProjectContext, params: Record<string, unknown>): PreconditionResult {
    const errors: string[] = [];
    const file = params["file"] as string;
    const lineNum = params["target"] as number;

    if (!Number.isInteger(lineNum) || lineNum < 1) {
      errors.push("param 'target' must be a positive integer line number");
      return { ok: false, errors };
    }

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
    const lineNum = params["target"] as number;

    const filePath = path.resolve(ctx.projectRoot, file);

    let source: string;
    try {
      source = readFileSync(filePath, "utf-8");
    } catch {
      return { success: false, filesChanged: [], description: `File not found: ${file}` };
    }

    const result = replaceLoopWithPipeline(source, lineNum);

    if (!result.success) {
      return { success: false, filesChanged: [], description: result.error };
    }

    writeFileSync(filePath, result.newSource, "utf-8");

    return {
      success: true,
      filesChanged: [file],
      description: `Replaced for-loop at line ${lineNum} with pipeline expression`,
    };
  },
});

interface TransformResult {
  success: boolean;
  newSource: string;
  error: string;
}

function replaceLoopWithPipeline(source: string, targetLine: number): TransformResult {
  const script = `
import ast, sys, json

source = sys.stdin.read()
lines = source.splitlines(True)
target_line = ${String(targetLine)}

tree = ast.parse(source)

def get_src(node):
    if node is None:
        return ""
    return ast.get_source_segment(source, node) or ""

# Find the for-loop at target_line
target_for = None
for node in ast.walk(tree):
    if isinstance(node, ast.For) and node.lineno == target_line:
        target_for = node
        break

if target_for is None:
    print(json.dumps({"success": False, "error": f"No for-loop found at line {target_line}"}))
    sys.exit(0)

body = target_for.body
iter_target_text = get_src(target_for.target)
iter_expr_text = get_src(target_for.iter)
loop_indent = " " * target_for.col_offset

# Find parent body containing the for-loop
def find_parent_body(tree, target):
    for node in ast.walk(tree):
        for attr in ("body", "orelse", "finalbody", "handlers"):
            stmts = getattr(node, attr, None)
            if isinstance(stmts, list) and target in stmts:
                return stmts
    return tree.body

parent_body = find_parent_body(tree, target_for)
for_idx = next(i for i, s in enumerate(parent_body) if s is target_for)

# Classify the loop body into a pattern
def classify(body_stmts):
    def has_break(stmts):
        for stmt in stmts:
            for n in ast.walk(stmt):
                if isinstance(n, ast.Break):
                    return True
        return False

    def has_side_effects(stmts):
        for stmt in stmts:
            for n in ast.walk(stmt):
                if isinstance(n, ast.Call):
                    f = n.func
                    if isinstance(f, ast.Name) and f.id in ("print", "open"):
                        return True
                    if isinstance(f, ast.Attribute) and f.attr in ("write", "send", "emit"):
                        return True
        return False

    if has_break(body_stmts):
        return "break-bail"

    if has_side_effects(body_stmts):
        return "side-effects"

    if len(body_stmts) == 1:
        stmt = body_stmts[0]

        # Nested for: for y in inner: result.append(expr)
        if isinstance(stmt, ast.For):
            inner = stmt
            if (len(inner.body) == 1
                    and isinstance(inner.body[0], ast.Expr)
                    and isinstance(inner.body[0].value, ast.Call)
                    and isinstance(inner.body[0].value.func, ast.Attribute)
                    and inner.body[0].value.func.attr == "append"):
                return "nested-append"

        # result.append(expr)
        if (isinstance(stmt, ast.Expr)
                and isinstance(stmt.value, ast.Call)
                and isinstance(stmt.value.func, ast.Attribute)):
            if stmt.value.func.attr == "append":
                return "append"
            if stmt.value.func.attr == "add":
                return "set-add"

        # result[key] = value
        if (isinstance(stmt, ast.Assign)
                and len(stmt.targets) == 1
                and isinstance(stmt.targets[0], ast.Subscript)):
            return "dict-assign"

        # result += expr
        if isinstance(stmt, ast.AugAssign) and isinstance(stmt.op, ast.Add):
            return "aug-assign"

        # if cond: result.append(expr)
        if (isinstance(stmt, ast.If)
                and len(stmt.orelse) == 0
                and len(stmt.body) == 1
                and isinstance(stmt.body[0], ast.Expr)
                and isinstance(stmt.body[0].value, ast.Call)
                and isinstance(stmt.body[0].value.func, ast.Attribute)
                and stmt.body[0].value.func.attr == "append"):
            return "filter-append"

    if len(body_stmts) == 2:
        s0, s1 = body_stmts[0], body_stmts[1]
        # if cond: continue; result.append(expr)
        if (isinstance(s0, ast.If)
                and len(s0.body) == 1
                and isinstance(s0.body[0], ast.Continue)
                and isinstance(s1, ast.Expr)
                and isinstance(s1.value, ast.Call)
                and isinstance(s1.value.func, ast.Attribute)
                and s1.value.func.attr == "append"):
            return "continue-filter"

    return "unknown"

pattern = classify(body)

if pattern == "side-effects":
    print(json.dumps({"success": False, "error": "Loop body has side effects; cannot replace with pipeline"}))
    sys.exit(0)

if pattern == "unknown":
    print(json.dumps({"success": False, "error": "Loop body pattern not recognized for pipeline replacement"}))
    sys.exit(0)

# Find initializer before the for-loop
def find_init_stmt(var_name, for_idx, parent_body):
    for i in range(for_idx - 1, -1, -1):
        stmt = parent_body[i]
        if isinstance(stmt, ast.Assign):
            for t in stmt.targets:
                if isinstance(t, ast.Name) and t.id == var_name:
                    return stmt
        if isinstance(stmt, ast.AnnAssign):
            if isinstance(stmt.target, ast.Name) and stmt.target.id == var_name:
                return stmt
    return None

# Build the replacement expression
replacement = None
accum_name = None

if pattern == "append":
    call = body[0].value
    accum_name = get_src(call.func.value)
    value_expr = get_src(call.args[0]) if call.args else iter_target_text
    replacement = f"{loop_indent}{accum_name} = [{value_expr} for {iter_target_text} in {iter_expr_text}]"

elif pattern == "set-add":
    call = body[0].value
    accum_name = get_src(call.func.value)
    value_expr = get_src(call.args[0]) if call.args else iter_target_text
    replacement = f"{loop_indent}{accum_name} = " + "{" + f"{value_expr} for {iter_target_text} in {iter_expr_text}" + "}"

elif pattern == "dict-assign":
    target = body[0].targets[0]
    accum_name = get_src(target.value)
    key_expr = get_src(target.slice)
    value_expr = get_src(body[0].value)
    replacement = f"{loop_indent}{accum_name} = " + "{" + f"{key_expr}: {value_expr} for {iter_target_text} in {iter_expr_text}" + "}"

elif pattern == "filter-append":
    stmt = body[0]
    call = stmt.body[0].value
    accum_name = get_src(call.func.value)
    value_expr = get_src(call.args[0]) if call.args else iter_target_text
    cond = get_src(stmt.test)
    replacement = f"{loop_indent}{accum_name} = [{value_expr} for {iter_target_text} in {iter_expr_text} if {cond}]"

elif pattern == "continue-filter":
    s0, s1 = body[0], body[1]
    call = s1.value
    accum_name = get_src(call.func.value)
    value_expr = get_src(call.args[0]) if call.args else iter_target_text
    not_cond = s0.test
    if isinstance(not_cond, ast.UnaryOp) and isinstance(not_cond.op, ast.Not):
        cond_text = get_src(not_cond.operand)
    else:
        cond_text = f"not ({get_src(not_cond)})"
    replacement = f"{loop_indent}{accum_name} = [{value_expr} for {iter_target_text} in {iter_expr_text} if {cond_text}]"

elif pattern == "nested-append":
    inner_for = body[0]
    inner_call = inner_for.body[0].value
    accum_name = get_src(inner_call.func.value)
    value_expr = get_src(inner_call.args[0]) if inner_call.args else get_src(inner_for.target)
    inner_target = get_src(inner_for.target)
    inner_iter = get_src(inner_for.iter)
    replacement = f"{loop_indent}{accum_name} = [{value_expr} for {iter_target_text} in {iter_expr_text} for {inner_target} in {inner_iter}]"

elif pattern == "aug-assign":
    stmt = body[0]
    accum_name = get_src(stmt.target)
    value_expr = get_src(stmt.value)
    # Simple case: += iter_var → sum(iter_expr)
    if isinstance(stmt.value, ast.Name) and stmt.value.id == iter_target_text:
        replacement = f"{loop_indent}{accum_name} = sum({iter_expr_text})"
    else:
        replacement = f"{loop_indent}{accum_name} = sum({value_expr} for {iter_target_text} in {iter_expr_text})"

elif pattern == "break-bail":
    # Find: if cond: result = expr; break
    found = False
    for stmt in body:
        if isinstance(stmt, ast.If):
            if_body = stmt.body
            assign_stmts = [s for s in if_body if isinstance(s, ast.Assign)]
            break_stmts = [s for s in if_body if isinstance(s, ast.Break)]
            if assign_stmts and break_stmts:
                assign = assign_stmts[0]
                accum_name = get_src(assign.targets[0])
                cond = get_src(stmt.test)
                replacement = f"{loop_indent}{accum_name} = next(({iter_target_text} for {iter_target_text} in {iter_expr_text} if {cond}), None)"
                found = True
                break
    if not found:
        print(json.dumps({"success": False, "error": "Could not detect break-bail pattern"}))
        sys.exit(0)

if replacement is None:
    print(json.dumps({"success": False, "error": "Could not build replacement expression"}))
    sys.exit(0)

# Find the initializer to remove (for patterns that have a separate accumulator init)
init_stmt = None
if pattern in ("append", "set-add", "dict-assign", "filter-append", "continue-filter", "nested-append", "aug-assign") and accum_name:
    init_stmt = find_init_stmt(accum_name, for_idx, parent_body)

# Build new source: remove init + loop, insert comprehension
for_start = target_for.lineno  # 1-indexed
for_end = target_for.end_lineno  # 1-indexed inclusive

new_lines = list(lines)

# Replace for-loop lines with the comprehension
new_lines[for_start - 1 : for_end] = [replacement + "\\n"]

if init_stmt is not None:
    # Re-parse to get updated line numbers? No — init is before the loop, so its
    # position didn't change. But we need to adjust for the for-loop replacement above.
    # The init line numbers are from the original source.
    init_start = init_stmt.lineno  # 1-indexed
    init_end = init_stmt.end_lineno  # 1-indexed inclusive

    # After replacing the for-loop block, line numbers before it are unchanged.
    # Remove the init lines.
    new_lines[init_start - 1 : init_end] = []

new_source = "".join(new_lines)

# Validate syntax
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
