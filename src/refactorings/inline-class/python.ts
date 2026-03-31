import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import type { PreconditionResult, RefactoringResult } from "../../core/refactoring.types.js";
import { definePythonRefactoring, pythonParam } from "../../python/python-refactoring-builder.js";
import type { PythonProjectContext } from "../../python/python-refactoring-builder.js";

export const inlineClassPython = definePythonRefactoring({
  name: "Inline Class (Python)",
  kebabName: "inline-class-python",
  tier: 3,
  description:
    "Moves all members of one class into another class and removes the emptied class.",
  params: [
    pythonParam.file(),
    pythonParam.identifier("target", "Name of the class to inline"),
    pythonParam.identifier("into", "Name of the class to receive the inlined members"),
  ],
  preconditions(ctx: PythonProjectContext, params: Record<string, unknown>): PreconditionResult {
    const errors: string[] = [];
    const file = params["file"] as string;
    const target = params["target"] as string;
    const into = params["into"] as string;

    const filePath = path.resolve(ctx.projectRoot, file);
    let source: string;
    try {
      source = readFileSync(filePath, "utf-8");
    } catch {
      errors.push(`File not found: ${file}`);
      return { ok: false, errors };
    }

    const result = validateInlineClass(source, target, into);
    if (!result.valid) {
      errors.push(...result.errors);
    }

    return { ok: errors.length === 0, errors };
  },
  apply(ctx: PythonProjectContext, params: Record<string, unknown>): RefactoringResult {
    const file = params["file"] as string;
    const target = params["target"] as string;
    const into = params["into"] as string;

    const filePath = path.resolve(ctx.projectRoot, file);

    let source: string;
    try {
      source = readFileSync(filePath, "utf-8");
    } catch {
      return { success: false, filesChanged: [], description: `File not found: ${file}` };
    }

    const result = applyInlineClass(source, target, into);

    if (!result.success) {
      return { success: false, filesChanged: [], description: result.error };
    }

    writeFileSync(filePath, result.newSource, "utf-8");

    return {
      success: true,
      filesChanged: [file],
      description: `Inlined class '${target}' into '${into}'`,
    };
  },
});

interface ValidateResult {
  valid: boolean;
  errors: string[];
}

function validateInlineClass(
  source: string,
  target: string,
  into: string,
): ValidateResult {
  const script = `
import ast
import sys
import json

source = sys.stdin.read()
target = ${JSON.stringify(target)}
into = ${JSON.stringify(into)}

tree = ast.parse(source)
errors = []

classes = {}
for node in ast.iter_child_nodes(tree):
    if isinstance(node, ast.ClassDef):
        classes[node.name] = node

if target not in classes:
    errors.append(f"Class '{target}' not found")
if into not in classes:
    errors.append(f"Class '{into}' not found")
if target == into:
    errors.append("'target' and 'into' must be different classes")

if not errors:
    into_cls = classes[into]
    found_link = False
    for stmt in into_cls.body:
        if isinstance(stmt, ast.FunctionDef) and stmt.name == "__init__":
            for s in ast.walk(stmt):
                if isinstance(s, ast.Call):
                    func = s.func
                    if isinstance(func, ast.Name) and func.id == target:
                        found_link = True
                        break
    if not found_link:
        errors.append(f"Class '{into}' does not reference '{target}' in its __init__")

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

function applyInlineClass(
  source: string,
  target: string,
  into: string,
): TransformResult {
  const script = `
import ast
import sys
import json
import textwrap
import re

source = sys.stdin.read()
target_name = ${JSON.stringify(target)}
into_name = ${JSON.stringify(into)}

tree = ast.parse(source)
lines = source.splitlines(True)

# ── Collect class info ──

classes = {}
for node in ast.iter_child_nodes(tree):
    if isinstance(node, ast.ClassDef):
        classes[node.name] = node

target_cls = classes[target_name]
into_cls = classes[into_name]

# ── Detect dataclass ──

target_is_dataclass = False
for dec in target_cls.decorator_list:
    if isinstance(dec, ast.Name) and dec.id == "dataclass":
        target_is_dataclass = True
    elif isinstance(dec, ast.Call) and isinstance(dec.func, ast.Name) and dec.func.id == "dataclass":
        target_is_dataclass = True

# ── Find link attribute in 'into' __init__ ──

link_attr = None
link_assign_line = None  # 0-based
link_assign_end = None   # 0-based exclusive
ctor_call = None

into_init = None
for stmt in into_cls.body:
    if isinstance(stmt, ast.FunctionDef) and stmt.name == "__init__":
        into_init = stmt
        for s in stmt.body:
            if isinstance(s, ast.Assign):
                for t in s.targets:
                    if (isinstance(t, ast.Attribute) and isinstance(t.value, ast.Name)
                            and t.value.id == "self" and isinstance(s.value, ast.Call)):
                        func = s.value.func
                        if isinstance(func, ast.Name) and func.id == target_name:
                            link_attr = t.attr
                            link_assign_line = s.lineno - 1
                            link_assign_end = s.end_lineno
                            ctor_call = s.value
            elif isinstance(s, ast.AnnAssign):
                if (isinstance(s.target, ast.Attribute) and isinstance(s.target.value, ast.Name)
                        and s.target.value.id == "self" and s.value and isinstance(s.value, ast.Call)):
                    func = s.value.func
                    if isinstance(func, ast.Name) and func.id == target_name:
                        link_attr = s.target.attr
                        link_assign_line = s.lineno - 1
                        link_assign_end = s.end_lineno
                        ctor_call = s.value

if link_attr is None:
    print(json.dumps({"success": False, "newSource": "", "error": f"No link from '{into_name}' to '{target_name}' found"}))
    sys.exit(0)

# ── Determine indentation ──

into_body_indent = "    "
if into_cls.body:
    first_line = lines[into_cls.body[0].lineno - 1]
    into_body_indent = first_line[:len(first_line) - len(first_line.lstrip())]

into_inner_indent = into_body_indent + "    "

# ── Collect target __init__ and methods ──

target_init = None
target_methods = []

for stmt in target_cls.body:
    if isinstance(stmt, ast.FunctionDef) and stmt.name == "__init__":
        target_init = stmt
    elif isinstance(stmt, (ast.FunctionDef, ast.AsyncFunctionDef)):
        target_methods.append(stmt)

# ── Build inlined init body lines ──

init_body_text_lines = []

if target_is_dataclass:
    # Dataclass fields are AnnAssign in class body
    dc_fields = []
    dc_defaults = {}
    for stmt in target_cls.body:
        if isinstance(stmt, ast.AnnAssign) and isinstance(stmt.target, ast.Name):
            fname = stmt.target.id
            dc_fields.append(fname)
            if stmt.value:
                dc_defaults[fname] = ast.get_source_segment(source, stmt.value)

    # Map constructor args to field names
    ctor_positional = [ast.get_source_segment(source, a) for a in ctor_call.args] if ctor_call else []
    ctor_kw = {}
    if ctor_call:
        for kw in ctor_call.keywords:
            ctor_kw[kw.arg] = ast.get_source_segment(source, kw.value)

    for i, fname in enumerate(dc_fields):
        if fname in ctor_kw:
            val = ctor_kw[fname]
        elif i < len(ctor_positional):
            val = ctor_positional[i]
        elif fname in dc_defaults:
            val = dc_defaults[fname]
        else:
            val = "None"
        init_body_text_lines.append(f"{into_inner_indent}self.{fname} = {val}")

elif target_init:
    # Get target __init__ params (excluding self)
    target_params = [a.arg for a in target_init.args.args if a.arg != "self"]

    # Get actual constructor args
    ctor_positional = [ast.get_source_segment(source, a) for a in ctor_call.args] if ctor_call else []
    ctor_kw = {}
    if ctor_call:
        for kw in ctor_call.keywords:
            ctor_kw[kw.arg] = ast.get_source_segment(source, kw.value)

    param_to_arg = {}
    for i, p in enumerate(target_params):
        if p in ctor_kw:
            param_to_arg[p] = ctor_kw[p]
        elif i < len(ctor_positional):
            param_to_arg[p] = ctor_positional[i]

    # Get each body statement of target __init__, substituting params
    for s in target_init.body:
        stmt_text = ast.get_source_segment(source, s)
        if stmt_text is None:
            continue
        # Substitute param names with actual args (negative lookbehind for '.' to avoid
        # replacing attribute names like self.prefix when param is 'prefix')
        for pname, atext in param_to_arg.items():
            stmt_text = re.sub(r'(?<!\\.)\\b' + re.escape(pname) + r'\\b', atext, stmt_text)
        # Re-indent to into_inner_indent
        dedented = textwrap.dedent(stmt_text)
        re_indented = textwrap.indent(dedented, into_inner_indent)
        init_body_text_lines.append(re_indented.rstrip())

# ── Build method texts to insert ──

method_text_blocks = []
for m in target_methods:
    start = m.lineno - 1
    if m.decorator_list:
        start = m.decorator_list[0].lineno - 1
    end = m.end_lineno
    raw = "".join(lines[start:end])
    dedented = textwrap.dedent(raw)
    re_indented = textwrap.indent(dedented, into_body_indent)
    method_text_blocks.append(re_indented.rstrip())

# ── Build the new into class body ──
# Strategy: rebuild the into class line by line

new_into_body_lines = []

# Process into_init body: copy all lines except the link assignment, insert inlined init body
if into_init:
    # into_init header line(s) — def __init__(...):
    init_header_start = into_init.lineno - 1
    if into_init.decorator_list:
        init_header_start = into_init.decorator_list[0].lineno - 1
    # The header ends at the first body statement line
    init_body_start = into_init.body[0].lineno - 1

    # Copy header
    for i in range(init_header_start, init_body_start):
        new_into_body_lines.append(lines[i].rstrip())

    # Copy body statements, replacing link assignment with inlined init body
    for s in into_init.body:
        s_start = s.lineno - 1
        s_end = s.end_lineno
        if s_start == link_assign_line:
            # Replace with inlined init body
            for ibl in init_body_text_lines:
                new_into_body_lines.append(ibl)
        else:
            # Copy existing statement, applying self._link.xxx -> self.xxx replacement
            for i in range(s_start, s_end):
                line_text = lines[i].rstrip()
                line_text = re.sub(r'self\\.' + re.escape(link_attr) + r'\\.', 'self.', line_text)
                new_into_body_lines.append(line_text)

# Copy non-__init__ methods from into class
for stmt in into_cls.body:
    if stmt is into_init:
        continue
    start = stmt.lineno - 1
    if hasattr(stmt, 'decorator_list') and stmt.decorator_list:
        start = stmt.decorator_list[0].lineno - 1
    end = stmt.end_lineno
    new_into_body_lines.append("")  # blank line before method
    for i in range(start, end):
        line_text = lines[i].rstrip()
        # Replace self._link.xxx -> self.xxx
        line_text = re.sub(r'self\\.' + re.escape(link_attr) + r'\\.', 'self.', line_text)
        new_into_body_lines.append(line_text)

# Add target methods
for block in method_text_blocks:
    new_into_body_lines.append("")
    new_into_body_lines.append(block)

# ── Build the into class header ──

into_header_lines = []
into_header_start = into_cls.lineno - 1
if into_cls.decorator_list:
    into_header_start = into_cls.decorator_list[0].lineno - 1
into_body_first = into_cls.body[0].lineno - 1
if into_init and into_init.decorator_list:
    into_body_first = into_init.decorator_list[0].lineno - 1

for i in range(into_header_start, into_body_first):
    into_header_lines.append(lines[i].rstrip())

# ── Build complete new into class ──

new_into_text = "\\n".join(into_header_lines + new_into_body_lines)

# ── Build the new file ──
# Collect everything that's not the target class or the into class

target_start = target_cls.lineno - 1
if target_cls.decorator_list:
    target_start = target_cls.decorator_list[0].lineno - 1
target_end = target_cls.end_lineno

into_start = into_cls.lineno - 1
if into_cls.decorator_list:
    into_start = into_cls.decorator_list[0].lineno - 1
into_end = into_cls.end_lineno

# Determine which class comes first
if target_start < into_start:
    first_class = ("target", target_start, target_end)
    second_class = ("into", into_start, into_end)
else:
    first_class = ("into", into_start, into_end)
    second_class = ("target", target_start, target_end)

# Build output segments
output_parts = []

# Before first class
before_first = "".join(lines[:first_class[1]])
# Strip trailing blank lines between the params line and the first class
output_parts.append(before_first.rstrip("\\n") + "\\n")

# First class (either target or into)
if first_class[0] == "into":
    output_parts.append("\\n" + new_into_text + "\\n")
# else: skip target class

# Between the two classes
between = "".join(lines[first_class[2]:second_class[1]])
if first_class[0] == "into":
    # Target is second — skip it, but keep any code between
    # Check if there's non-blank code between
    between_stripped = between.strip()
    if between_stripped:
        output_parts.append("\\n" + between_stripped + "\\n")
else:
    # Into is second — skip blank lines from removed target
    between_stripped = between.strip()
    if between_stripped:
        output_parts.append("\\n" + between_stripped + "\\n")
    output_parts.append("\\n" + new_into_text + "\\n")

# After second class
after = "".join(lines[second_class[2]:])
if after.strip():
    output_parts.append("\\n" + after.lstrip("\\n"))

new_source = "".join(output_parts)

# ── Update __all__ if present ──
# Only modify the specific line(s) containing __all__, not the whole source

new_source_lines = new_source.splitlines(True)
for node in ast.iter_child_nodes(tree):
    if isinstance(node, ast.Assign):
        for t in node.targets:
            if isinstance(t, ast.Name) and t.id == "__all__":
                q = '[' + chr(34) + chr(39) + ']'
                for li in range(len(new_source_lines)):
                    if '__all__' in new_source_lines[li]:
                        line = new_source_lines[li]
                        line = re.sub(r',\\s*' + q + re.escape(target_name) + q, '', line)
                        line = re.sub(q + re.escape(target_name) + q + r'\\s*,\\s*', '', line)
                        line = re.sub(q + re.escape(target_name) + q, '', line)
                        new_source_lines[li] = line
                new_source = "".join(new_source_lines)

# Clean up excessive blank lines (more than 2 consecutive)
new_source = re.sub(r'\\n{4,}', '\\n\\n\\n', new_source)

# Ensure file ends with single newline
new_source = new_source.rstrip() + "\\n"

print(json.dumps({
    "success": True,
    "newSource": new_source,
    "error": "",
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
