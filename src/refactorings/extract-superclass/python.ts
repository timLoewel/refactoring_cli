import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import type { PreconditionResult, RefactoringResult } from "../../core/refactoring.types.js";
import { definePythonRefactoring, pythonParam } from "../../python/python-refactoring-builder.js";
import type { PythonProjectContext } from "../../python/python-refactoring-builder.js";

export const extractSuperclassPython = definePythonRefactoring({
  name: "Extract Superclass (Python)",
  kebabName: "extract-superclass-python",
  tier: 4,
  description:
    "Extracts methods and/or slots from a class into a new superclass, making the original class extend it.",
  params: [
    pythonParam.file(),
    pythonParam.identifier("target", "Name of the class to extract from"),
    pythonParam.identifier("superclassName", "Name for the new superclass"),
    pythonParam.string("methods", "Comma-separated method names to move to superclass", false),
    pythonParam.string(
      "slots",
      "Comma-separated slot names to move to superclass __slots__",
      false,
    ),
    pythonParam.string("abstract", 'Set to "true" to create an ABC with @abstractmethod', false),
    pythonParam.string("outFile", "File path for the new superclass (cross-file extraction)", false),
  ],
  preconditions(ctx: PythonProjectContext, params: Record<string, unknown>): PreconditionResult {
    const errors: string[] = [];
    const file = params["file"] as string;
    const target = params["target"] as string;
    const superclassName = params["superclassName"] as string;
    const methods = (params["methods"] as string | undefined) ?? "";
    const slots = (params["slots"] as string | undefined) ?? "";

    const filePath = path.resolve(ctx.projectRoot, file);
    let source: string;
    try {
      source = readFileSync(filePath, "utf-8");
    } catch {
      errors.push(`File not found: ${file}`);
      return { ok: false, errors };
    }

    const result = validateExtractSuperclass(source, target, superclassName, methods, slots);
    if (!result.valid) {
      errors.push(...result.errors);
    }

    return { ok: errors.length === 0, errors };
  },
  apply(ctx: PythonProjectContext, params: Record<string, unknown>): RefactoringResult {
    const file = params["file"] as string;
    const target = params["target"] as string;
    const superclassName = params["superclassName"] as string;
    const methods = (params["methods"] as string | undefined) ?? "";
    const slots = (params["slots"] as string | undefined) ?? "";
    const isAbstract = (params["abstract"] as string | undefined) === "true";
    const outFile = (params["outFile"] as string | undefined) ?? "";

    const filePath = path.resolve(ctx.projectRoot, file);
    let source: string;
    try {
      source = readFileSync(filePath, "utf-8");
    } catch {
      return { success: false, filesChanged: [], description: `File not found: ${file}` };
    }

    const result = applyExtractSuperclass(
      source,
      target,
      superclassName,
      methods,
      slots,
      isAbstract,
      outFile,
    );

    if (!result.success) {
      return { success: false, filesChanged: [], description: result.error };
    }

    const filesChanged: string[] = [];

    if (result.sourceFile) {
      writeFileSync(filePath, result.sourceFile, "utf-8");
      filesChanged.push(file);
    }

    if (outFile && result.outFileContent) {
      const outFilePath = path.resolve(ctx.projectRoot, outFile);
      writeFileSync(outFilePath, result.outFileContent, "utf-8");
      filesChanged.push(outFile);
    }

    return {
      success: true,
      filesChanged,
      description: `Extracted superclass '${superclassName}' from '${target}'`,
    };
  },
});

interface ValidateResult {
  valid: boolean;
  errors: string[];
}

function validateExtractSuperclass(
  source: string,
  target: string,
  superclassName: string,
  methods: string,
  slots: string,
): ValidateResult {
  const targetJ = JSON.stringify(target);
  const superclassNameJ = JSON.stringify(superclassName);
  const methodsJ = JSON.stringify(methods);
  const slotsJ = JSON.stringify(slots);

  const script = `
import ast, sys, json
source = sys.stdin.read()
target = ${targetJ}
superclass_name = ${superclassNameJ}
methods_str = ${methodsJ}
slots_str = ${slotsJ}

tree = ast.parse(source)
errors = []

all_classes = {}
for node in ast.walk(tree):
    if isinstance(node, ast.ClassDef):
        all_classes[node.name] = node

if target not in all_classes:
    print(json.dumps({"valid": False, "errors": [f"Class '{target}' not found"]}))
    sys.exit(0)

if superclass_name in all_classes:
    errors.append(f"Class '{superclass_name}' already exists in file")

target_cls = all_classes[target]

if methods_str:
    method_names = [m.strip() for m in methods_str.split(",") if m.strip()]
    existing_methods = {n.name for n in ast.iter_child_nodes(target_cls) if isinstance(n, ast.FunctionDef)}
    for m in method_names:
        if m not in existing_methods:
            errors.append(f"Method '{m}' not found in class '{target}'")

if slots_str:
    slot_names = [s.strip() for s in slots_str.split(",") if s.strip()]
    existing_slots = set()
    for node in ast.iter_child_nodes(target_cls):
        if isinstance(node, ast.Assign):
            for tgt in node.targets:
                if isinstance(tgt, ast.Name) and tgt.id == "__slots__":
                    val = node.value
                    if isinstance(val, (ast.Tuple, ast.List)):
                        for elt in val.elts:
                            if isinstance(elt, ast.Constant):
                                existing_slots.add(elt.value)
    for s in slot_names:
        if s not in existing_slots:
            errors.append(f"Slot '{s}' not found in __slots__ of class '{target}'")

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

interface ApplyResult {
  success: boolean;
  sourceFile?: string;
  outFileContent?: string;
  error: string;
}

function applyExtractSuperclass(
  source: string,
  target: string,
  superclassName: string,
  methods: string,
  slots: string,
  isAbstract: boolean,
  outFile: string,
): ApplyResult {
  const targetJ = JSON.stringify(target);
  const superclassNameJ = JSON.stringify(superclassName);
  const methodsJ = JSON.stringify(methods);
  const slotsJ = JSON.stringify(slots);
  const isAbstractJ = isAbstract ? "True" : "False";
  const outFileJ = JSON.stringify(outFile);

  const script = `
import ast, sys, json, textwrap
source = sys.stdin.read()
target = ${targetJ}
superclass_name = ${superclassNameJ}
methods_str = ${methodsJ}
slots_str = ${slotsJ}
is_abstract = ${isAbstractJ}
out_file = ${outFileJ}

tree = ast.parse(source)
lines = source.splitlines(True)

all_classes = {}
for node in ast.walk(tree):
    if isinstance(node, ast.ClassDef):
        all_classes[node.name] = node

target_cls = all_classes[target]

method_names = [m.strip() for m in methods_str.split(",") if m.strip()] if methods_str else []
slot_names = [s.strip() for s in slots_str.split(",") if s.strip()] if slots_str else []

def get_method_node(cls, name):
    for node in ast.iter_child_nodes(cls):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name == name:
            return node
    return None

def get_method_lines(node):
    start = node.lineno - 1
    if node.decorator_list:
        start = node.decorator_list[0].lineno - 1
    end = node.end_lineno
    return lines[start:end]

def get_body_indent(cls):
    # Use first body node's col_offset
    for node in cls.body:
        return node.col_offset
    return 4

def reindent(text_lines, src_indent, dst_indent):
    result = []
    for line in text_lines:
        stripped = line.lstrip()
        if not stripped or stripped == "\\n":
            result.append("\\n")
        else:
            current = len(line) - len(stripped)
            extra = max(0, current - src_indent)
            result.append(" " * (dst_indent + extra) + stripped)
    return result

def get_return_annotation(node):
    if node.returns:
        return ast.unparse(node.returns)
    return None

def get_args_text(node):
    return ast.unparse(node.args)

def build_abstract_stub(node, body_indent):
    # Build @abstractmethod stub for the method
    indent = " " * body_indent
    lines_out = []
    # Copy non-abstractmethod decorators
    for dec in node.decorator_list:
        dec_text = ast.get_source_segment(source, dec)
        if dec_text and "abstractmethod" not in dec_text:
            lines_out.append(indent + "@" + dec_text + "\\n")
    lines_out.append(indent + "@abstractmethod\\n")
    args_text = get_args_text(node)
    ret = get_return_annotation(node)
    if isinstance(node, ast.AsyncFunctionDef):
        prefix = "async def"
    else:
        prefix = "def"
    if ret:
        lines_out.append(indent + f"{prefix} {node.name}({args_text}) -> {ret}:\\n")
    else:
        lines_out.append(indent + f"{prefix} {node.name}({args_text}):\\n")
    lines_out.append(indent + "    ...\\n")
    return lines_out

# Collect extracted method lines (for superclass body)
superclass_method_lines = []
# ops: ("delete", start_0idx, end_0idx_excl) | ("replace_slots", line_0idx, new_str) | ("replace_class_def", line_0idx, new_str)
ops = []

target_body_indent = get_body_indent(target_cls)

for mname in method_names:
    node = get_method_node(target_cls, mname)
    if node is None:
        continue
    method_src_lines = get_method_lines(node)
    start = node.lineno - 1
    if node.decorator_list:
        start = node.decorator_list[0].lineno - 1
    end = node.end_lineno

    if is_abstract:
        # Build abstract stub for superclass, keep concrete in target
        stub_lines = build_abstract_stub(node, 4)  # 4-space indent in superclass
        superclass_method_lines.append("\\n")
        superclass_method_lines.extend(stub_lines)
    else:
        # Move method to superclass (re-indent to 4 spaces)
        re_indented = reindent(method_src_lines, target_body_indent, 4)
        superclass_method_lines.append("\\n")
        superclass_method_lines.extend(re_indented)
        # Delete from target (only when not abstract)
        # Also delete preceding blank lines
        blank_start = start
        while blank_start > 0 and (blank_start - 1 >= target_cls.body[0].lineno - 1):
            prev = lines[blank_start - 1]
            if prev.strip() == "":
                blank_start -= 1
            else:
                break
        ops.append(("delete", blank_start, end))

# Handle __slots__ modification
slots_node = None
for node in ast.iter_child_nodes(target_cls):
    if isinstance(node, ast.Assign):
        for tgt in node.targets:
            if isinstance(tgt, ast.Name) and tgt.id == "__slots__":
                slots_node = node
                break
    if slots_node:
        break

superclass_slots = []
if slot_names and slots_node:
    val = slots_node.value
    if isinstance(val, (ast.Tuple, ast.List)):
        existing = [e.value for e in val.elts if isinstance(e, ast.Constant)]
        remaining = [s for s in existing if s not in slot_names]
        superclass_slots = [s for s in existing if s in slot_names]
        # Build new target __slots__ line
        src_indent = slots_node.col_offset
        indent = " " * src_indent
        if not remaining:
            new_slots_line = indent + "__slots__ = ()\\n"
        elif len(remaining) == 1:
            new_slots_line = indent + "__slots__ = (" + repr(remaining[0]) + ",)\\n"
        else:
            new_slots_line = indent + "__slots__ = (" + ", ".join(repr(s) for s in remaining) + ")\\n"
        ops.append(("replace_slots", slots_node.lineno - 1, new_slots_line))

# Build the class def line replacement
target_line_idx = target_cls.lineno - 1
# Get existing bases text
existing_bases = []
for base in target_cls.bases:
    existing_bases.append(ast.get_source_segment(source, base))
if existing_bases:
    new_bases = superclass_name + ", " + ", ".join(existing_bases)
else:
    new_bases = superclass_name
# Preserve decorators on the class itself
class_line = lines[target_line_idx]
# Replace the class definition line content
import re
new_class_line = re.sub(r"^(\\s*class\\s+" + re.escape(target) + r")(?:\\([^)]*\\))?:", "\\\\1(" + new_bases + "):", class_line)
ops.append(("replace_class_def", target_line_idx, new_class_line))

# Sort ops: deletions first (by line desc), then replacements
delete_ops = sorted([op for op in ops if op[0] == "delete"], key=lambda op: op[1], reverse=True)
replace_ops = [op for op in ops if op[0] != "delete"]

new_lines = list(lines)

# Apply replacements first (they don't change line count)
for op in replace_ops:
    new_lines[op[1]] = op[2]

# Apply deletions in reverse order
for op in delete_ops:
    del new_lines[op[1]:op[2]]

new_source = "".join(new_lines)

# Add pass to class/def bodies that became empty after method deletion
import re as _re
def fix_empty_blocks(text):
    result = []
    src_lines = text.splitlines(True)
    i = 0
    while i < len(src_lines):
        line = src_lines[i]
        result.append(line)
        stripped = line.rstrip()
        if stripped.endswith(":") and _re.search(r"(?:^|\\s)class\\s+\\w", stripped):
            block_indent = len(line) - len(line.lstrip())
            j = i + 1
            while j < len(src_lines) and src_lines[j].strip() == "":
                j += 1
            if j >= len(src_lines) or (src_lines[j].strip() and (len(src_lines[j]) - len(src_lines[j].lstrip())) <= block_indent):
                result.append(" " * (block_indent + 4) + "pass\\n")
        i += 1
    return "".join(result)

new_source = fix_empty_blocks(new_source)

# Build superclass text
superclass_header_parts = []
if is_abstract:
    superclass_header_parts.append("ABC")
if superclass_slots:
    slots_repr = ", ".join(repr(s) for s in superclass_slots)
    if len(superclass_slots) == 1:
        slots_repr += ","
    slots_line = "    __slots__ = (" + slots_repr + ")\\n"
else:
    slots_line = None

if superclass_header_parts:
    superclass_class_line = f"class {superclass_name}({', '.join(superclass_header_parts)}):\\n"
else:
    superclass_class_line = f"class {superclass_name}:\\n"

# Build superclass body
superclass_body = []
if slots_line:
    superclass_body.append(slots_line)
if superclass_method_lines:
    # Strip leading blank line from first method
    if superclass_method_lines and superclass_method_lines[0] == "\\n" and slots_line:
        pass  # keep blank line after slots
    elif superclass_method_lines and superclass_method_lines[0] == "\\n":
        superclass_method_lines = superclass_method_lines[1:]
    superclass_body.extend(superclass_method_lines)

if not superclass_body:
    superclass_body = ["    pass\\n"]

superclass_lines = [superclass_class_line] + superclass_body

# Determine if we need to add abc import
abc_import = ""
if is_abstract:
    abc_import = "from abc import ABC, abstractmethod\\n"

if out_file:
    # Cross-file: write superclass to new file, add import to source file
    out_content = abc_import
    out_content += "".join(superclass_lines)

    # Add import to source file
    # Find insertion point: after last import statement
    import_end = 0
    for node in tree.body:
        if isinstance(node, (ast.Import, ast.ImportFrom)):
            import_end = node.end_lineno
        elif not isinstance(node, (ast.Import, ast.ImportFrom)):
            if import_end == 0:
                break

    # Determine module name from out_file (strip .py)
    module_name = out_file
    if module_name.endswith(".py"):
        module_name = module_name[:-3]
    module_name = module_name.replace("/", ".").replace("\\\\", ".")

    import_line = f"from {module_name} import {superclass_name}\\n"

    new_src_lines = new_source.splitlines(True)
    if import_end > 0:
        new_src_lines.insert(import_end, import_line)
    else:
        new_src_lines.insert(0, import_line)
    new_source = "".join(new_src_lines)

    try:
        ast.parse(new_source)
        ast.parse(out_content)
    except SyntaxError as e:
        print(json.dumps({"success": False, "error": f"Generated invalid Python: {e}"}))
        sys.exit(0)

    print(json.dumps({"success": True, "sourceFile": new_source, "outFileContent": out_content, "error": ""}))
else:
    # Same file: insert superclass before target class
    # Re-parse to find updated target class position
    try:
        new_tree = ast.parse(new_source)
    except SyntaxError as e:
        print(json.dumps({"success": False, "error": f"Generated invalid Python after edit: {e}"}))
        sys.exit(0)

    new_lines2 = new_source.splitlines(True)

    # Find target class in new tree
    new_target_line = None
    for node in ast.walk(new_tree):
        if isinstance(node, ast.ClassDef) and node.name == target:
            new_target_line = node.lineno - 1
            if node.decorator_list:
                new_target_line = node.decorator_list[0].lineno - 1
            break

    insert_at = new_target_line if new_target_line is not None else 0

    superclass_text_lines = []
    if abc_import:
        # Check if abc import already exists
        has_abc = any(
            (isinstance(n, ast.ImportFrom) and n.module == "abc")
            for n in new_tree.body
        )
        if not has_abc:
            # Insert abc import at top (after any existing imports)
            abc_import_end = 0
            for node in new_tree.body:
                if isinstance(node, (ast.Import, ast.ImportFrom)):
                    abc_import_end = node.end_lineno
                elif not isinstance(node, (ast.Import, ast.ImportFrom)):
                    break
            if abc_import_end > 0:
                new_lines2.insert(abc_import_end, abc_import)
                insert_at += 1  # adjust for inserted line
            else:
                new_lines2.insert(0, abc_import)
                insert_at += 1

    superclass_text_lines = superclass_lines + ["\\n\\n"]
    new_lines2[insert_at:insert_at] = superclass_text_lines

    final_source = "".join(new_lines2)
    try:
        ast.parse(final_source)
    except SyntaxError as e:
        print(json.dumps({"success": False, "error": f"Generated invalid Python: {e}"}))
        sys.exit(0)

    print(json.dumps({"success": True, "sourceFile": final_source, "outFileContent": None, "error": ""}))
`;

  try {
    const output = execFileSync("python3", ["-c", script], {
      encoding: "utf-8",
      input: source,
      timeout: 15_000,
    }).trim();

    const parsed = JSON.parse(output) as {
      success: boolean;
      sourceFile?: string;
      outFileContent?: string;
      error?: string;
    };

    if (!parsed.success) {
      return { success: false, error: parsed.error ?? "Unknown error" };
    }

    return {
      success: true,
      sourceFile: parsed.sourceFile,
      outFileContent: parsed.outFileContent ?? undefined,
      error: "",
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
