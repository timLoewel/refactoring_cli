import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import type { PreconditionResult, RefactoringResult } from "../../core/refactoring.types.js";
import { definePythonRefactoring, pythonParam } from "../../python/python-refactoring-builder.js";
import type { PythonProjectContext } from "../../python/python-refactoring-builder.js";

export const replaceTypeCodeWithSubclassesPython = definePythonRefactoring({
  name: "Replace Type Code with Subclasses (Python)",
  kebabName: "replace-type-code-with-subclasses-python",
  tier: 4,
  description:
    "Replaces a type code field in a class with a proper subclass hierarchy, making the type distinction explicit in the class structure.",
  params: [
    pythonParam.file(),
    pythonParam.identifier("target", "Name of the class containing the type code field"),
    pythonParam.string("typeField", "Name of the type code field to replace with subclasses"),
  ],
  preconditions(ctx: PythonProjectContext, params: Record<string, unknown>): PreconditionResult {
    const errors: string[] = [];
    const file = params["file"] as string;
    const target = params["target"] as string;
    const typeField = params["typeField"] as string;

    const filePath = path.resolve(ctx.projectRoot, file);
    let source: string;
    try {
      source = readFileSync(filePath, "utf-8");
    } catch {
      errors.push(`File not found: ${file}`);
      return { ok: false, errors };
    }

    const result = validateReplaceTypeCode(source, target, typeField);
    if (!result.valid) {
      errors.push(...result.errors);
    }

    return { ok: errors.length === 0, errors };
  },
  apply(ctx: PythonProjectContext, params: Record<string, unknown>): RefactoringResult {
    const file = params["file"] as string;
    const target = params["target"] as string;
    const typeField = params["typeField"] as string;

    const filePath = path.resolve(ctx.projectRoot, file);
    let source: string;
    try {
      source = readFileSync(filePath, "utf-8");
    } catch {
      return { success: false, filesChanged: [], description: `File not found: ${file}` };
    }

    const result = applyReplaceTypeCode(source, target, typeField);
    if (!result.success) {
      return { success: false, filesChanged: [], description: result.error };
    }

    writeFileSync(filePath, result.newSource, "utf-8");
    const filesChanged: string[] = [file];

    // Update cross-file references if needed
    updateCrossFileReferences(
      ctx.projectRoot,
      file,
      target,
      typeField,
      result.subclassNames,
      filesChanged,
    );

    return {
      success: true,
      filesChanged,
      description: `Replaced type code field '${typeField}' in '${target}' with subclass hierarchy; created ${result.subclassNames.map((n) => `'${n}'`).join(", ")}`,
    };
  },
});

interface ValidateResult {
  valid: boolean;
  errors: string[];
}

function validateReplaceTypeCode(
  source: string,
  target: string,
  typeField: string,
): ValidateResult {
  const script = `
import ast, sys, json

source = sys.stdin.read()
target = ${JSON.stringify(target)}
type_field = ${JSON.stringify(typeField)}

try:
    tree = ast.parse(source)
except SyntaxError as e:
    print(json.dumps({"valid": False, "errors": [f"Syntax error: {e}"]}))
    sys.exit(0)

errors = []
target_cls = None
for node in ast.iter_child_nodes(tree):
    if isinstance(node, ast.ClassDef) and node.name == target:
        target_cls = node
        break

if target_cls is None:
    errors.append(f"Class '{target}' not found")
    print(json.dumps({"valid": False, "errors": errors}))
    sys.exit(0)

# Look for type_field in __init__ params or as class/instance attribute
found = False
for node in ast.walk(target_cls):
    if isinstance(node, ast.FunctionDef) and node.name == "__init__":
        for arg in node.args.args:
            if arg.arg == type_field:
                found = True
                break
        if not found:
            for stmt in node.body:
                if isinstance(stmt, ast.Assign):
                    for t in stmt.targets:
                        if isinstance(t, ast.Attribute) and t.attr == type_field:
                            found = True
                elif isinstance(stmt, ast.AnnAssign):
                    if isinstance(stmt.target, ast.Attribute) and stmt.target.attr == type_field:
                        found = True
    if isinstance(node, ast.AnnAssign) and isinstance(node.target, ast.Name):
        if node.target.id == type_field:
            found = True
    if isinstance(node, ast.Assign):
        for t in node.targets:
            if isinstance(t, ast.Name) and t.id == type_field:
                found = True

print(json.dumps({"valid": len(errors) == 0 and found or len(errors) > 0 and False,
                  "errors": errors if errors else ([] if found else [f"Field '{type_field}' not found in class '{target}'"])}))
`;

  try {
    const output = execFileSync("python3", ["-c", script], {
      encoding: "utf-8",
      input: source,
      timeout: 10_000,
    }).trim();
    const parsed = JSON.parse(output) as { valid: boolean; errors: string[] };
    return { valid: parsed.valid, errors: parsed.errors };
  } catch (err) {
    return {
      valid: false,
      errors: [err instanceof Error ? err.message : String(err)],
    };
  }
}

interface ApplyResult {
  success: boolean;
  newSource: string;
  subclassNames: string[];
  error: string;
}

function applyReplaceTypeCode(source: string, target: string, typeField: string): ApplyResult {
  const script = `
import ast, sys, json, re, textwrap

source = sys.stdin.read()
target = ${JSON.stringify(target)}
type_field = ${JSON.stringify(typeField)}

try:
    tree = ast.parse(source)
except SyntaxError as e:
    print(json.dumps({"success": False, "newSource": "", "subclassNames": [], "error": str(e)}))
    sys.exit(0)

lines = source.splitlines(True)

# Find the target class
target_cls = None
for node in ast.iter_child_nodes(tree):
    if isinstance(node, ast.ClassDef) and node.name == target:
        target_cls = node
        break

if target_cls is None:
    print(json.dumps({"success": False, "newSource": "", "subclassNames": [],
                      "error": f"Class '{target}' not found"}))
    sys.exit(0)

def camel_to_pascal(s):
    parts = re.split(r'[_\\-\\s]+', s)
    return "".join(p.capitalize() for p in parts if p)

# Detect enum-based type code
enum_class_name = None
enum_values = {}
for node in ast.iter_child_nodes(tree):
    if isinstance(node, ast.ClassDef) and node.name != target:
        for base in node.bases:
            is_enum = (isinstance(base, ast.Name) and base.id == "Enum") or \\
                      (isinstance(base, ast.Attribute) and base.attr == "Enum")
            if is_enum:
                for item in node.body:
                    if isinstance(item, ast.Assign):
                        for t in item.targets:
                            if isinstance(t, ast.Name) and isinstance(item.value, ast.Constant):
                                enum_values[t.id] = str(item.value.value)
                if enum_values:
                    enum_class_name = node.name
                break

# Collect type values from conditionals and match-case in target class
type_values = []

if enum_class_name:
    used_members = set()
    for node in ast.walk(target_cls):
        if isinstance(node, ast.Compare):
            for comp in node.comparators:
                if isinstance(comp, ast.Attribute) and isinstance(comp.value, ast.Name):
                    if comp.value.id == enum_class_name:
                        used_members.add(comp.attr)
        if isinstance(node, ast.Match):
            for case in node.cases:
                if isinstance(case.pattern, ast.MatchValue):
                    val = case.pattern.value
                    if isinstance(val, ast.Attribute) and isinstance(val.value, ast.Name):
                        if val.value.id == enum_class_name:
                            used_members.add(val.attr)
    members = sorted(used_members) if used_members else sorted(enum_values.keys())
    for member in members:
        type_values.append((camel_to_pascal(member), f"{enum_class_name}.{member}", True))
else:
    string_vals = set()
    for node in ast.walk(target_cls):
        if isinstance(node, ast.Compare) and len(node.ops) == 1 and isinstance(node.ops[0], ast.Eq):
            lhs = node.left
            rhs = node.comparators[0]
            is_field = lambda n: (
                (isinstance(n, ast.Attribute) and n.attr == type_field) or
                (isinstance(n, ast.Name) and n.id == type_field)
            )
            if is_field(lhs) and isinstance(rhs, ast.Constant) and isinstance(rhs.value, str):
                string_vals.add(rhs.value)
            elif is_field(rhs) and isinstance(lhs, ast.Constant) and isinstance(lhs.value, str):
                string_vals.add(lhs.value)
        if isinstance(node, ast.Match):
            subj = node.subject
            is_field_match = (
                (isinstance(subj, ast.Attribute) and subj.attr == type_field) or
                (isinstance(subj, ast.Name) and subj.id == type_field)
            )
            if is_field_match:
                for case in node.cases:
                    if isinstance(case.pattern, ast.MatchValue):
                        val = case.pattern.value
                        if isinstance(val, ast.Constant) and isinstance(val.value, str):
                            string_vals.add(val.value)
    for val in sorted(string_vals):
        type_values.append((camel_to_pascal(val), val, False))

# Fallback: collect from self.type_field = "value" in __init__
if not type_values:
    for node in ast.walk(target_cls):
        if isinstance(node, ast.Assign):
            for t in node.targets:
                if isinstance(t, ast.Attribute) and t.attr == type_field:
                    if isinstance(node.value, ast.Constant) and isinstance(node.value.value, str):
                        v = node.value.value
                        type_values.append((camel_to_pascal(v), v, False))

body_indent = "    "

# Build subclass definitions — each subclass overrides the type field as a @property
# keeping the base class __init__ intact so existing call sites continue to work
subclass_names = [target + suffix for suffix, _, _ in type_values]
subclass_text_parts = []

for suffix, val, is_enum in type_values:
    cls_name = target + suffix
    if is_enum:
        enum_annotation = enum_class_name or "str"
        subclass_text_parts.append(
            f"class {cls_name}({target}):\\n"
            f"{body_indent}@property\\n"
            f"{body_indent}def {type_field}(self) -> {enum_annotation}:  # type: ignore[override]\\n"
            f"{body_indent}    return {val}\\n"
        )
    else:
        subclass_text_parts.append(
            f"class {cls_name}({target}):\\n"
            f"{body_indent}@property\\n"
            f"{body_indent}def {type_field}(self) -> str:  # type: ignore[override]\\n"
            f'{body_indent}    return "{val}"\\n'
        )

new_lines = list(lines)

# Append subclass definitions at end of file
new_lines.append("\\n")
for subclass_text in subclass_text_parts:
    new_lines.append("\\n")
    new_lines.append(subclass_text)

new_source = "".join(new_lines)

# Validate the result parses
try:
    ast.parse(new_source)
except SyntaxError as e:
    print(json.dumps({"success": False, "newSource": "", "subclassNames": [],
                      "error": f"Result has syntax error: {e}"}))
    sys.exit(0)

print(json.dumps({
    "success": True,
    "newSource": new_source,
    "subclassNames": subclass_names,
    "error": ""
}))
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
      subclassNames: string[];
      error: string;
    };

    if (!parsed.success) {
      return {
        success: false,
        newSource: "",
        subclassNames: [],
        error: parsed.error,
      };
    }

    return {
      success: true,
      newSource: parsed.newSource,
      subclassNames: parsed.subclassNames,
      error: "",
    };
  } catch (err) {
    return {
      success: false,
      newSource: "",
      subclassNames: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function updateCrossFileReferences(
  projectRoot: string,
  changedFile: string,
  targetName: string,
  _typeField: string,
  subclassNames: string[],
  filesChanged: string[],
): void {
  if (subclassNames.length === 0) return;

  // Cross-file: no structural changes needed — base class call sites still work
  // since we only ADD subclasses without modifying the base class __init__.
  // Files that import the class will continue to work unchanged.
  void projectRoot;
  void changedFile;
  void targetName;
  void filesChanged;
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

// Keep collectPythonFiles available for potential future cross-file use
void collectPythonFiles;
