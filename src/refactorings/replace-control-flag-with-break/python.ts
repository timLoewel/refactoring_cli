import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import type { PreconditionResult, RefactoringResult } from "../../core/refactoring.types.js";
import { definePythonRefactoring, pythonParam } from "../../python/python-refactoring-builder.js";
import type { PythonProjectContext } from "../../python/python-refactoring-builder.js";

export const replaceControlFlagWithBreakPython = definePythonRefactoring({
  name: "Replace Control Flag with Break (Python)",
  kebabName: "replace-control-flag-with-break-python",
  tier: 2,
  description:
    "Replaces a boolean control flag used to exit a loop with an explicit break statement.",
  params: [
    pythonParam.file(),
    pythonParam.identifier("target", "Name of the boolean control flag variable to replace"),
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

    const filePath = path.resolve(ctx.projectRoot, file);

    let source: string;
    try {
      source = readFileSync(filePath, "utf-8");
    } catch {
      return { success: false, filesChanged: [], description: `File not found: ${file}` };
    }

    const result = replaceControlFlag(source, target);

    if (!result.success) {
      return { success: false, filesChanged: [], description: result.error };
    }

    writeFileSync(filePath, result.newSource, "utf-8");

    return {
      success: true,
      filesChanged: [file],
      description: `Replaced control flag '${target}' with break statement`,
    };
  },
});

interface TransformResult {
  success: boolean;
  newSource: string;
  error: string;
}

function replaceControlFlag(source: string, target: string): TransformResult {
  const script = `
import ast
import sys
import json

source = sys.stdin.read()
target = ${JSON.stringify(target)}

tree = ast.parse(source)
lines = source.splitlines(True)

def get_indent(node):
    line = lines[node.lineno - 1]
    indent = ""
    for ch in line:
        if ch in (" ", "\\t"):
            indent += ch
        else:
            break
    return indent

def get_stmt_lines(stmt):
    """Get the original source lines for a statement."""
    return lines[stmt.lineno - 1:stmt.end_lineno]

def get_stmt_text(stmt, new_indent):
    """Get statement text re-indented to new_indent."""
    start_line = stmt.lineno - 1
    end_line = stmt.end_lineno
    orig_indent = ""
    first = lines[start_line]
    for ch in first:
        if ch in (" ", "\\t"):
            orig_indent += ch
        else:
            break
    result = []
    for li in range(start_line, end_line):
        lt = lines[li]
        if lt.startswith(orig_indent):
            result.append(new_indent + lt[len(orig_indent):])
        else:
            result.append(new_indent + lt.lstrip())
    return result

def find_flag_declaration(body):
    """Find the flag = True/False assignment in a body list."""
    for i, stmt in enumerate(body):
        if isinstance(stmt, ast.Assign) and len(stmt.targets) == 1:
            t = stmt.targets[0]
            if isinstance(t, ast.Name) and t.id == target:
                if isinstance(stmt.value, ast.Constant) and isinstance(stmt.value.value, bool):
                    return i, stmt
    return None, None

def has_flag_assign(node, trigger_val):
    """Check if a node tree contains a flag assignment to trigger_val."""
    for n in ast.walk(node):
        if isinstance(n, ast.Assign) and len(n.targets) == 1:
            t = n.targets[0]
            if isinstance(t, ast.Name) and t.id == target:
                if isinstance(n.value, ast.Constant) and n.value.value == trigger_val:
                    return True
    return False

def is_flag_check(stmt, positive):
    """Check if stmt is 'if flag:' (positive=True) or 'if not flag:' (positive=False)."""
    if not isinstance(stmt, ast.If):
        return False
    if positive:
        return isinstance(stmt.test, ast.Name) and stmt.test.id == target
    else:
        return (isinstance(stmt.test, ast.UnaryOp) and isinstance(stmt.test.op, ast.Not)
                and isinstance(stmt.test.operand, ast.Name) and stmt.test.operand.id == target)

def rebuild_block(stmts, indent, trigger_val):
    """Rebuild a block, replacing flag=trigger_val with break at end of containing sub-block."""
    result = []
    for stmt in stmts:
        # Direct flag assignment
        if isinstance(stmt, ast.Assign) and len(stmt.targets) == 1:
            t = stmt.targets[0]
            if isinstance(t, ast.Name) and t.id == target:
                if isinstance(stmt.value, ast.Constant) and stmt.value.value == trigger_val:
                    # Skip — break will be appended by caller or at block end
                    continue

        # If statement containing flag assignment in one branch
        if isinstance(stmt, ast.If) and (has_flag_assign(stmt, trigger_val)):
            cond_start = sum(len(lines[i]) for i in range(stmt.test.lineno - 1)) + stmt.test.col_offset
            cond_end = sum(len(lines[i]) for i in range(stmt.test.end_lineno - 1)) + stmt.test.end_col_offset
            cond_text = source[cond_start:cond_end]

            body_indent = indent + "    "
            if has_flag_assign_direct(stmt.body, trigger_val):
                result.append(indent + f"if {cond_text}:\\n")
                inner = rebuild_block(stmt.body, body_indent, trigger_val)
                result.extend(inner)
                result.append(body_indent + "break\\n")
                if stmt.orelse:
                    if len(stmt.orelse) == 1 and isinstance(stmt.orelse[0], ast.If):
                        # elif chain
                        elif_text = rebuild_elif(stmt.orelse[0], indent, trigger_val)
                        result.extend(elif_text)
                    else:
                        result.append(indent + "else:\\n")
                        for s in stmt.orelse:
                            result.extend(get_stmt_text(s, body_indent))
            elif stmt.orelse and has_flag_assign_direct(stmt.orelse, trigger_val):
                result.append(indent + f"if {cond_text}:\\n")
                for s in stmt.body:
                    result.extend(get_stmt_text(s, body_indent))
                result.append(indent + "else:\\n")
                inner = rebuild_block(stmt.orelse, body_indent, trigger_val)
                result.extend(inner)
                result.append(body_indent + "break\\n")
            else:
                # Flag assign is deeper — just keep original
                result.extend(get_stmt_text(stmt, indent))
            continue

        result.extend(get_stmt_text(stmt, indent))
    return result

def rebuild_elif(elif_stmt, indent, trigger_val):
    """Rebuild an elif as part of a chain."""
    cond_start = sum(len(lines[i]) for i in range(elif_stmt.test.lineno - 1)) + elif_stmt.test.col_offset
    cond_end = sum(len(lines[i]) for i in range(elif_stmt.test.end_lineno - 1)) + elif_stmt.test.end_col_offset
    cond_text = source[cond_start:cond_end]
    body_indent = indent + "    "
    result = []
    if has_flag_assign_direct(elif_stmt.body, trigger_val):
        result.append(indent + f"elif {cond_text}:\\n")
        inner = rebuild_block(elif_stmt.body, body_indent, trigger_val)
        result.extend(inner)
        result.append(body_indent + "break\\n")
        if elif_stmt.orelse:
            if len(elif_stmt.orelse) == 1 and isinstance(elif_stmt.orelse[0], ast.If):
                result.extend(rebuild_elif(elif_stmt.orelse[0], indent, trigger_val))
            else:
                result.append(indent + "else:\\n")
                for s in elif_stmt.orelse:
                    result.extend(get_stmt_text(s, body_indent))
    else:
        result.append(indent + f"elif {cond_text}:\\n")
        for s in elif_stmt.body:
            result.extend(get_stmt_text(s, body_indent))
        if elif_stmt.orelse:
            if has_flag_assign_direct(elif_stmt.orelse, trigger_val):
                result.append(indent + "else:\\n")
                inner = rebuild_block(elif_stmt.orelse, body_indent, trigger_val)
                result.extend(inner)
                result.append(body_indent + "break\\n")
            elif len(elif_stmt.orelse) == 1 and isinstance(elif_stmt.orelse[0], ast.If):
                result.extend(rebuild_elif(elif_stmt.orelse[0], indent, trigger_val))
            else:
                result.append(indent + "else:\\n")
                for s in elif_stmt.orelse:
                    result.extend(get_stmt_text(s, body_indent))
    return result

def has_flag_assign_direct(stmts, trigger_val):
    """Check if any statement in stmts is a direct flag assignment (not nested)."""
    for stmt in stmts:
        if isinstance(stmt, ast.Assign) and len(stmt.targets) == 1:
            t = stmt.targets[0]
            if isinstance(t, ast.Name) and t.id == target:
                if isinstance(stmt.value, ast.Constant) and stmt.value.value == trigger_val:
                    return True
    return False

def find_containing_scope(tree, flag_decl):
    """Find the body list that contains the flag declaration."""
    for node in ast.walk(tree):
        body = getattr(node, "body", None)
        if body and isinstance(body, list) and flag_decl in body:
            return node, body
    return None, None

# Main logic
# Find the scope containing the flag
for node in ast.walk(tree):
    body = getattr(node, "body", None)
    if not body or not isinstance(body, list):
        continue
    decl_idx, flag_decl = find_flag_declaration(body)
    if flag_decl is not None:
        container = node
        container_body = body
        break
else:
    print(json.dumps({"success": False, "error": f"Variable '{target}' not found or not a boolean flag"}))
    sys.exit(0)

initial_value = flag_decl.value.value
trigger_value = not initial_value

# Find the loop that uses the flag
loop_idx = None
target_loop = None
for i in range(decl_idx + 1, len(container_body)):
    stmt = container_body[i]
    if isinstance(stmt, (ast.For, ast.While)):
        for n in ast.walk(stmt):
            if isinstance(n, ast.Name) and n.id == target:
                loop_idx = i
                target_loop = stmt
                break
        if target_loop:
            break

if target_loop is None:
    print(json.dumps({"success": False, "error": f"No loop found using '{target}'"}))
    sys.exit(0)

loop_indent = get_indent(target_loop)
body_indent = loop_indent + "    "

# Rebuild loop body
new_body = rebuild_block(target_loop.body, body_indent, trigger_value)

# Handle nested loop pattern: "if flag: break" after inner loop → "else: continue" + "break"
# Look for inner loops in the original body, and if flag check follows them
has_inner_loop = False
inner_loop_indices = []
flag_check_indices = []
for bi, stmt in enumerate(target_loop.body):
    if isinstance(stmt, (ast.For, ast.While)):
        has_inner_loop = True
        inner_loop_indices.append(bi)
    if has_inner_loop and is_flag_check(stmt, trigger_value):
        # Check if body is just 'break'
        if len(stmt.body) == 1 and isinstance(stmt.body[0], ast.Break):
            flag_check_indices.append(bi)

if flag_check_indices:
    # Rebuild the body differently for nested loop pattern
    new_body = []
    skip_next_flag_check = False
    for bi, stmt in enumerate(target_loop.body):
        if bi in flag_check_indices:
            # Replace "if flag: break" with "break" — but we need the inner loop
            # to have "else: continue" before this break
            new_body.append(body_indent + "break\\n")
            continue

        if isinstance(stmt, (ast.For, ast.While)) and has_flag_assign(stmt, trigger_value):
            # Rebuild inner loop with break and add "else: continue"
            inner_indent = body_indent + "    "
            inner_body = rebuild_block(stmt.body, inner_indent, trigger_value)

            # Keep original loop header
            new_body.append(lines[stmt.lineno - 1])
            new_body.extend(inner_body)
            new_body.append(body_indent + "else:\\n")
            new_body.append(inner_indent + "continue\\n")
            continue

        # Check if this is a flag assignment
        if isinstance(stmt, ast.Assign) and len(stmt.targets) == 1:
            t = stmt.targets[0]
            if isinstance(t, ast.Name) and t.id == target:
                if isinstance(stmt.value, ast.Constant) and stmt.value.value == trigger_value:
                    continue  # Skip flag assignment

        new_body.extend(get_stmt_text(stmt, body_indent))

# Build the loop header
if isinstance(target_loop, ast.While):
    test = target_loop.test
    if isinstance(test, ast.Name) and test.id == target:
        loop_header = loop_indent + "while True:\\n"
    elif (isinstance(test, ast.UnaryOp) and isinstance(test.op, ast.Not)
          and isinstance(test.operand, ast.Name) and test.operand.id == target):
        loop_header = loop_indent + "while True:\\n"
    else:
        loop_header = lines[target_loop.lineno - 1]
else:
    loop_header = lines[target_loop.lineno - 1]

# Build the for/else for post-loop flag checks
for_else_lines = []
post_loop_end_idx = loop_idx  # index in container_body (inclusive)

if isinstance(target_loop, ast.For):
    # Check for post-loop "if flag:" check
    for i in range(loop_idx + 1, len(container_body)):
        stmt = container_body[i]
        if is_flag_check(stmt, trigger_value):
            # Positive check: if flag: <triggered> [else: <not_triggered>]
            triggered = stmt.body
            not_triggered = stmt.orelse
            post_loop_end_idx = i
        elif is_flag_check(stmt, not trigger_value):
            # Negative check: if not flag: <not_triggered> [else: <triggered>]
            not_triggered = stmt.body
            triggered = stmt.orelse
            post_loop_end_idx = i
        else:
            break

        # Build for/else
        if not_triggered:
            for_else_lines.append(loop_indent + "else:\\n")
            for s in not_triggered:
                for_else_lines.extend(get_stmt_text(s, body_indent))
        else:
            # Remaining statements after the if-check become the else body
            remaining = container_body[i + 1:]
            if remaining:
                for_else_lines.append(loop_indent + "else:\\n")
                for s in remaining:
                    for_else_lines.extend(get_stmt_text(s, body_indent))
                post_loop_end_idx = len(container_body) - 1

        # Triggered body stays after the loop
        if triggered:
            for s in triggered:
                for_else_lines.extend(get_stmt_text(s, loop_indent))
        break

# Assemble the replacement region
# From flag_decl through the loop and any post-loop flag checks
region_start = flag_decl.lineno - 1  # 0-based line
region_end = container_body[post_loop_end_idx].end_lineno  # 1-based exclusive

# Statements between flag_decl and loop (preserve)
pre_loop = []
for i in range(decl_idx + 1, loop_idx):
    pre_loop.extend(get_stmt_lines(container_body[i]))

replacement = pre_loop + [loop_header] + new_body + for_else_lines

new_lines = list(lines)
new_lines[region_start:region_end] = replacement

new_source = "".join(new_lines)

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
