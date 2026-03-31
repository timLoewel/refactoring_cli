import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import type { PreconditionResult, RefactoringResult } from "../../core/refactoring.types.js";
import { definePythonRefactoring, pythonParam } from "../../python/python-refactoring-builder.js";
import type { PythonProjectContext } from "../../python/python-refactoring-builder.js";

export const removeSubclassPython = definePythonRefactoring({
  name: "Remove Subclass (Python)",
  kebabName: "remove-subclass-python",
  tier: 4,
  description:
    "Removes a subclass by merging its members into the parent and replacing subclass distinctions with a type field.",
  params: [
    pythonParam.file(),
    pythonParam.identifier("target", "Name of the subclass to remove"),
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

    const result = validateRemoveSubclass(source, target);
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

    const result = applyRemoveSubclass(source, target);
    if (!result.success) {
      return { success: false, filesChanged: [], description: result.error };
    }

    writeFileSync(filePath, result.newSource, "utf-8");
    const filesChanged: string[] = [file];

    updateCrossFileReferences(
      ctx.projectRoot,
      file,
      target,
      result.parentName,
      result.typeFieldName,
      result.typeValue,
      filesChanged,
    );

    return {
      success: true,
      filesChanged,
      description: `Removed subclass '${target}', merged into '${result.parentName}' with type field '${result.typeFieldName}'`,
    };
  },
});

interface ValidateResult {
  valid: boolean;
  errors: string[];
}

function validateRemoveSubclass(source: string, target: string): ValidateResult {
  const targetJ = JSON.stringify(target);

  const script = `
import ast, sys, json

source = sys.stdin.read()
target = ${targetJ}

try:
    tree = ast.parse(source)
except SyntaxError as e:
    print(json.dumps({"valid": False, "errors": [f"Syntax error: {e}"]}))
    sys.exit(0)

errors = []
classes = {}
for node in ast.iter_child_nodes(tree):
    if isinstance(node, ast.ClassDef):
        classes[node.name] = node

if target not in classes:
    errors.append(f"Class '{target}' not found")
    print(json.dumps({"valid": False, "errors": errors}))
    sys.exit(0)

target_cls = classes[target]
if not target_cls.bases:
    errors.append(f"Class '{target}' does not extend any class — it is not a subclass")
    print(json.dumps({"valid": False, "errors": errors}))
    sys.exit(0)

parent_name = ast.unparse(target_cls.bases[0])
if parent_name not in classes:
    errors.append(f"Parent class '{parent_name}' not found in same file")

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
  newSource: string;
  parentName: string;
  typeFieldName: string;
  typeValue: string;
  error: string;
}

function applyRemoveSubclass(source: string, target: string): ApplyResult {
  const targetJ = JSON.stringify(target);

  const script = `
import ast, sys, json, re, textwrap

source = sys.stdin.read()
target = ${targetJ}

tree = ast.parse(source)
lines = source.splitlines(True)

classes = {}
for node in ast.iter_child_nodes(tree):
    if isinstance(node, ast.ClassDef):
        classes[node.name] = node

target_cls = classes[target]
parent_name = ast.unparse(target_cls.bases[0])
parent_cls = classes[parent_name]

# Derive type field name and value (CamelCase → snake_case)
def to_snake(name):
    s = re.sub(r'(?<=[a-z])([A-Z])', r'_\\1', name)
    s = re.sub(r'(?<=[A-Z])([A-Z][a-z])', r'_\\1', s)
    return s.lower()

type_value = to_snake(target)
type_field_name = type_value + "_type"

def get_body_indent(cls):
    for node in cls.body:
        return node.col_offset
    return 4

def is_trivial_body(cls):
    body = cls.body
    if not body:
        return True
    if len(body) == 1:
        node = body[0]
        if isinstance(node, ast.Pass):
            return True
        if isinstance(node, ast.Expr) and isinstance(node.value, ast.Constant) and isinstance(node.value.value, str):
            return True
    return False

def get_member_lines(cls, node, src_indent, dst_indent):
    start = node.lineno - 1
    if hasattr(node, 'decorator_list') and node.decorator_list:
        start = node.decorator_list[0].lineno - 1
    end = node.end_lineno
    raw = "".join(lines[start:end])
    result = []
    for line in raw.splitlines(True):
        stripped = line.lstrip()
        if not stripped or stripped == "\\n":
            result.append("\\n")
        else:
            current = len(line) - len(line.lstrip())
            extra = max(0, current - src_indent)
            result.append(" " * (dst_indent + extra) + stripped)
    return result

sub_body_indent = get_body_indent(target_cls)
par_body_indent = get_body_indent(parent_cls)

# Collect members to copy from subclass to parent
# Skip __init__ if parent already has one
members_to_copy = []
if not is_trivial_body(target_cls):
    parent_method_names = set()
    for m in ast.iter_child_nodes(parent_cls):
        if isinstance(m, (ast.FunctionDef, ast.AsyncFunctionDef)):
            parent_method_names.add(m.name)

    for node in ast.iter_child_nodes(target_cls):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.Assign, ast.AnnAssign)):
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name == "__init__":
                if "__init__" not in parent_method_names:
                    members_to_copy.append(node)
            else:
                members_to_copy.append(node)

# Build lines to insert at end of parent class (members + type field)
insert_lines = []

# Add the type discriminator field if parent doesn't already have it
has_type_field = any(
    (isinstance(n, ast.Assign) and any(
        isinstance(t, ast.Name) and t.id == type_field_name for t in n.targets
    )) or (isinstance(n, ast.AnnAssign) and isinstance(n.target, ast.Name) and n.target.id == type_field_name)
    for n in ast.walk(parent_cls)
)
if not has_type_field:
    insert_lines.append("\\n")
    insert_lines.append(" " * par_body_indent + type_field_name + ': str = "' + type_value + '"\\n')

for node in members_to_copy:
    insert_lines.append("\\n")
    ml = get_member_lines(target_cls, node, sub_body_indent, par_body_indent)
    insert_lines.extend(ml)

# Positions for edits
parent_insert_at = parent_cls.end_lineno  # 0-indexed insert after this line

sub_start = target_cls.lineno - 1
if target_cls.decorator_list:
    sub_start = target_cls.decorator_list[0].lineno - 1
sub_end = target_cls.end_lineno  # exclusive in 0-indexed

new_lines = list(lines)

if parent_insert_at <= sub_start:
    # Parent above subclass: insert at higher index first, then delete lower-index subclass
    new_lines[parent_insert_at:parent_insert_at] = insert_lines
    shift = len(insert_lines)
    del new_lines[sub_start + shift:sub_end + shift]
    # Remove preceding blank lines of subclass
    blank_idx = sub_start + shift - 1
    while blank_idx >= 0 and new_lines[blank_idx].strip() == "":
        del new_lines[blank_idx]
        blank_idx -= 1
else:
    # Parent below subclass: delete first then insert
    del new_lines[sub_start:sub_end]
    shift = -(sub_end - sub_start)
    new_lines[parent_insert_at + shift:parent_insert_at + shift] = insert_lines

new_source = "".join(new_lines)

# Rewrite isinstance(x, Target) → x.type_field == "type_value"
# Pattern: isinstance(<expr>, Target) where Target is the subclass
def rewrite_isinstance(src):
    # Match isinstance(<expr>, Target) — handles simple expressions
    pattern = r'isinstance\\(([^,()]+),\\s*' + re.escape(target) + r'\\)'
    def replacer(m):
        expr = m.group(1).strip()
        return expr + '.' + type_field_name + ' == "' + type_value + '"'
    return re.sub(pattern, replacer, src)

new_source = rewrite_isinstance(new_source)

# Rewrite Target(args) → ParentClass(args) (creation site replacement)
def rewrite_creation(src):
    # Match Target( ... ) but not as part of class definition or import
    # Avoid matching "class Target(" or "isinstance(..., Target)"
    pattern = r'(?<![.\\w])' + re.escape(target) + r'\\('
    def replacer(m):
        return parent_name + '('
    # Apply to lines that are not class definitions
    result_lines = []
    for line in src.splitlines(True):
        stripped = line.lstrip()
        if stripped.startswith('class '):
            result_lines.append(line)
        else:
            result_lines.append(re.sub(pattern, replacer, line))
    return "".join(result_lines)

new_source = rewrite_creation(new_source)

# Rewrite type annotations: ": Target" → ": ParentClass", "-> Target" → "-> ParentClass"
# and other annotation contexts
def rewrite_annotations(src):
    return re.sub(r'(?<![.\\w])' + re.escape(target) + r'(?![\\w])', parent_name, src)

new_source = rewrite_annotations(new_source)

try:
    ast.parse(new_source)
except SyntaxError as e:
    print(json.dumps({"success": False, "newSource": "", "parentName": parent_name,
                      "typeFieldName": type_field_name, "typeValue": type_value,
                      "error": f"Generated invalid Python: {e}"}))
    sys.exit(0)

print(json.dumps({"success": True, "newSource": new_source, "parentName": parent_name,
                  "typeFieldName": type_field_name, "typeValue": type_value, "error": ""}))
`;

  try {
    const output = execFileSync("python3", ["-c", script], {
      encoding: "utf-8",
      input: source,
      timeout: 15_000,
    }).trim();

    const parsed = JSON.parse(output) as {
      success: boolean;
      newSource: string;
      parentName: string;
      typeFieldName: string;
      typeValue: string;
      error: string;
    };

    if (!parsed.success) {
      return {
        success: false,
        newSource: "",
        parentName: "",
        typeFieldName: "",
        typeValue: "",
        error: parsed.error,
      };
    }

    return {
      success: true,
      newSource: parsed.newSource,
      parentName: parsed.parentName,
      typeFieldName: parsed.typeFieldName,
      typeValue: parsed.typeValue,
      error: "",
    };
  } catch (err) {
    return {
      success: false,
      newSource: "",
      parentName: "",
      typeFieldName: "",
      typeValue: "",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function updateCrossFileReferences(
  projectRoot: string,
  changedFile: string,
  subclassName: string,
  parentName: string,
  typeFieldName: string,
  typeValue: string,
  filesChanged: string[],
): void {
  const script = `
import ast, sys, json, re

source = sys.stdin.read()
subclass_name = ${JSON.stringify(subclassName)}
parent_name = ${JSON.stringify(parentName)}
type_field_name = ${JSON.stringify(typeFieldName)}
type_value = ${JSON.stringify(typeValue)}

if subclass_name not in source:
    print(json.dumps({"changed": False, "newSource": source}))
    sys.exit(0)

try:
    tree = ast.parse(source)
except SyntaxError:
    print(json.dumps({"changed": False, "newSource": source}))
    sys.exit(0)

lines = source.splitlines(True)
changed = False
new_lines = list(lines)

# Update imports: replace subclass_name with parent_name in import statements
for node in ast.walk(tree):
    if isinstance(node, ast.ImportFrom):
        imported_names = [alias.name for alias in node.names]
        if subclass_name in imported_names:
            line_idx = node.lineno - 1
            line = new_lines[line_idx]
            new_line = re.sub(r'(?<![\\w])' + re.escape(subclass_name) + r'(?![\\w])', parent_name, line)
            if new_line != line:
                new_lines[line_idx] = new_line
                changed = True

new_source = "".join(new_lines)

# Rewrite isinstance checks
def rewrite_isinstance(src):
    pattern = r'isinstance\\(([^,()]+),\\s*' + re.escape(subclass_name) + r'\\)'
    def replacer(m):
        expr = m.group(1).strip()
        return expr + '.' + type_field_name + ' == "' + type_value + '"'
    result = re.sub(pattern, replacer, src)
    return result

new_source2 = rewrite_isinstance(new_source)
if new_source2 != new_source:
    changed = True
    new_source = new_source2

# Rewrite creation sites: SubClass(...) → ParentClass(...)
def rewrite_creation(src):
    result_lines = []
    for line in src.splitlines(True):
        stripped = line.lstrip()
        if stripped.startswith('class '):
            result_lines.append(line)
        else:
            new_line = re.sub(r'(?<![.\\w])' + re.escape(subclass_name) + r'\\(', parent_name + '(', line)
            result_lines.append(new_line)
    return "".join(result_lines)

new_source3 = rewrite_creation(new_source)
if new_source3 != new_source:
    changed = True
    new_source = new_source3

# Rewrite remaining references (type annotations, etc.)
new_source4 = re.sub(r'(?<![.\\w])' + re.escape(subclass_name) + r'(?![\\w])', parent_name, new_source)
if new_source4 != new_source:
    changed = True
    new_source = new_source4

print(json.dumps({"changed": changed, "newSource": new_source}))
`;

  const pyFiles = collectPythonFiles(projectRoot);
  for (const pyFile of pyFiles) {
    if (path.resolve(projectRoot, pyFile) === path.resolve(projectRoot, changedFile)) {
      continue;
    }
    const fullPath = path.resolve(projectRoot, pyFile);
    let fileSource: string;
    try {
      fileSource = readFileSync(fullPath, "utf-8");
    } catch {
      continue;
    }

    if (!fileSource.includes(subclassName)) {
      continue;
    }

    try {
      const output = execFileSync("python3", ["-c", script], {
        encoding: "utf-8",
        input: fileSource,
        timeout: 10_000,
      }).trim();

      const parsed = JSON.parse(output) as { changed: boolean; newSource: string };
      if (parsed.changed) {
        writeFileSync(fullPath, parsed.newSource, "utf-8");
        filesChanged.push(pyFile);
      }
    } catch {
      // skip files that fail
    }
  }
}

function collectPythonFiles(dir: string): string[] {
  const results: string[] = [];
  function walk(current: string): void {
    let entries: string[];
    try {
      entries = readdirSync(current);
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.startsWith(".") || entry === "__pycache__" || entry === "node_modules") continue;
      const full = path.join(current, entry);
      let stat;
      try {
        stat = statSync(full);
      } catch {
        continue;
      }
      if (stat.isDirectory()) {
        walk(full);
      } else if (entry.endsWith(".py")) {
        results.push(path.relative(dir, full));
      }
    }
  }
  walk(dir);
  return results;
}
