import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import type { PreconditionResult, RefactoringResult } from "../../core/refactoring.types.js";
import { definePythonRefactoring, pythonParam } from "../../python/python-refactoring-builder.js";
import type { PythonProjectContext } from "../../python/python-refactoring-builder.js";

export const collapseHierarchyPython = definePythonRefactoring({
  name: "Collapse Hierarchy (Python)",
  kebabName: "collapse-hierarchy-python",
  tier: 4,
  description:
    "Merges a subclass that adds nothing meaningful back into its parent class and removes the subclass.",
  params: [
    pythonParam.file(),
    pythonParam.identifier("target", "Name of the subclass to collapse into its parent"),
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

    const result = validateCollapseHierarchy(source, target);
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

    const result = applyCollapseHierarchy(source, target);
    if (!result.success) {
      return { success: false, filesChanged: [], description: result.error };
    }

    writeFileSync(filePath, result.newSource, "utf-8");
    const filesChanged: string[] = [file];

    // Update cross-file references
    const projectRoot = ctx.projectRoot;
    const parentName = result.parentName;
    updateCrossFileReferences(projectRoot, file, target, parentName, filesChanged);

    return {
      success: true,
      filesChanged,
      description: `Collapsed subclass '${target}' into parent class '${parentName}'`,
    };
  },
});

interface ValidateResult {
  valid: boolean;
  errors: string[];
}

function validateCollapseHierarchy(source: string, target: string): ValidateResult {
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
    errors.append(f"Class '{target}' does not extend any class")
    print(json.dumps({"valid": False, "errors": errors}))
    sys.exit(0)

parent_name = ast.unparse(target_cls.bases[0])
if parent_name not in classes:
    errors.append(f"Parent class '{parent_name}' not found in same file (cannot collapse across files)")

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
  error: string;
}

function applyCollapseHierarchy(source: string, target: string): ApplyResult {
  const targetJ = JSON.stringify(target);

  const script = `
import ast, sys, json, textwrap, re

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

def get_body_indent(cls):
    for node in cls.body:
        return node.col_offset
    return 4

def get_method_lines(cls, node, src_indent, dst_indent):
    start = node.lineno - 1
    if node.decorator_list:
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

# Determine what to copy from subclass to parent
# (skip trivial bodies: pass, docstring-only, empty)
def is_trivial_body(cls):
    body = cls.body
    if not body:
        return True
    if len(body) == 1:
        node = body[0]
        if isinstance(node, ast.Pass):
            return True
        if isinstance(node, ast.Expr) and isinstance(node.value, ast.Constant) and isinstance(node.value.value, str):
            return True  # docstring only
    return False

sub_body_indent = get_body_indent(target_cls)
par_body_indent = get_body_indent(parent_cls)

members_to_copy = []
if not is_trivial_body(target_cls):
    for node in ast.iter_child_nodes(target_cls):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.Assign, ast.AnnAssign)):
            if isinstance(node, ast.FunctionDef) and node.name == "__init__":
                # Only copy __init__ if parent doesn't have one
                has_parent_init = any(
                    isinstance(m, ast.FunctionDef) and m.name == "__init__"
                    for m in ast.iter_child_nodes(parent_cls)
                )
                if not has_parent_init:
                    members_to_copy.append(node)
            else:
                members_to_copy.append(node)

# Build lines to insert at end of parent class
insert_lines = []
for node in members_to_copy:
    insert_lines.append("\\n")
    ml = get_method_lines(target_cls, node, sub_body_indent, par_body_indent)
    insert_lines.extend(ml)

# Now build the new source:
# 1. Insert members at end of parent class
# 2. Remove the subclass
# 3. Replace references to subclass name with parent name (type annotations, isinstance)

# Find insertion point (end of parent class)
parent_insert_at = parent_cls.end_lineno  # 1-indexed, exclusive = 0-indexed insert after

# Find subclass range for deletion
sub_start = target_cls.lineno - 1
if target_cls.decorator_list:
    sub_start = target_cls.decorator_list[0].lineno - 1
sub_end = target_cls.end_lineno  # 0-indexed exclusive

new_lines = list(lines)

if parent_insert_at <= sub_start:
    # Parent is above subclass: insert first (higher index won't shift parent)
    # But insert before sub_start, so insert first then delete
    # Actually parent_insert_at < sub_start, so insert at lower index shifts sub_start
    new_lines[parent_insert_at:parent_insert_at] = insert_lines
    shift = len(insert_lines)
    del new_lines[sub_start + shift:sub_end + shift]
    # Also remove preceding blank lines of subclass
    blank_before = sub_start + shift - 1
    while blank_before >= 0 and new_lines[blank_before].strip() == "":
        del new_lines[blank_before]
        blank_before -= 1
else:
    # Parent is below subclass (unusual): delete subclass first then insert
    del new_lines[sub_start:sub_end]
    shift = -(sub_end - sub_start)
    new_lines[parent_insert_at + shift:parent_insert_at + shift] = insert_lines

new_source = "".join(new_lines)

# Replace all references to the subclass name with the parent name
# in type annotations, isinstance() checks, and __all__
def replace_name_refs(src, from_name, to_name):
    # Replace isinstance(x, SubClass) with isinstance(x, ParentClass)
    # Replace type annotations: ": SubClass" -> ": ParentClass", "-> SubClass" -> "-> ParentClass"
    # Use word-boundary regex to avoid partial matches
    return re.sub(r'(?<![.\\w])' + re.escape(from_name) + r'(?![\\w])', to_name, src)

new_source = replace_name_refs(new_source, target, parent_name)

# Update __all__ if present: remove subclass entry if it's separate from parent
# (if both were in __all__, remove the subclass one; if only subclass, replace with parent)
# Actually replace_name_refs above already handles the name replacement in __all__

try:
    ast.parse(new_source)
except SyntaxError as e:
    print(json.dumps({"success": False, "newSource": "", "parentName": parent_name, "error": f"Generated invalid Python: {e}"}))
    sys.exit(0)

print(json.dumps({"success": True, "newSource": new_source, "parentName": parent_name, "error": ""}))
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
      error: string;
    };

    if (!parsed.success) {
      return { success: false, newSource: "", parentName: "", error: parsed.error };
    }

    return {
      success: true,
      newSource: parsed.newSource,
      parentName: parsed.parentName,
      error: "",
    };
  } catch (err) {
    return {
      success: false,
      newSource: "",
      parentName: "",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function updateCrossFileReferences(
  projectRoot: string,
  changedFile: string,
  subclassName: string,
  parentName: string,
  filesChanged: string[],
): void {
  const changedRelative = path.relative(projectRoot, path.resolve(projectRoot, changedFile));
  const moduleName = changedRelative.replace(/\.py$/, "").replace(/\//g, ".");

  const script = `
import ast, sys, json, re

source = sys.stdin.read()
subclass_name = ${JSON.stringify(subclassName)}
parent_name = ${JSON.stringify(parentName)}
module_name = ${JSON.stringify(moduleName)}

try:
    tree = ast.parse(source)
except SyntaxError:
    print(json.dumps({"changed": False, "newSource": source}))
    sys.exit(0)

lines = source.splitlines(True)
edits = []  # (line_idx_0, new_line_str)

# Find imports of subclass_name from module_name
for node in ast.walk(tree):
    if isinstance(node, ast.ImportFrom):
        # Check if this imports subclass_name from the relevant module
        imported_names = [alias.name for alias in node.names]
        if subclass_name in imported_names:
            # Replace subclass_name with parent_name in the import
            line_idx = node.lineno - 1
            line = lines[line_idx]
            # Use word boundary replacement
            new_line = re.sub(r'(?<![\\w])' + re.escape(subclass_name) + r'(?![\\w])', parent_name, line)
            if new_line != line:
                edits.append((line_idx, new_line))

if not edits:
    print(json.dumps({"changed": False, "newSource": source}))
    sys.exit(0)

new_lines = list(lines)
for line_idx, new_line in edits:
    new_lines[line_idx] = new_line

# Also replace all usages of subclass_name in the rest of the file
new_source = "".join(new_lines)
new_source = re.sub(r'(?<![.\\w])' + re.escape(subclass_name) + r'(?![\\w])', parent_name, new_source)

print(json.dumps({"changed": True, "newSource": new_source}))
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
