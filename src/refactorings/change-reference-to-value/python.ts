import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import type { PreconditionResult, RefactoringResult } from "../../core/refactoring.types.js";
import { definePythonRefactoring, pythonParam } from "../../python/python-refactoring-builder.js";
import type { PythonProjectContext } from "../../python/python-refactoring-builder.js";

export const changeReferenceToValuePython = definePythonRefactoring({
  name: "Change Reference To Value (Python)",
  kebabName: "change-reference-to-value-python",
  tier: 3,
  description:
    "Converts a reference object into a value object by adding __eq__ and __hash__ methods (or making a dataclass frozen).",
  params: [
    pythonParam.file(),
    pythonParam.identifier("target", "Name of the class to convert to a value object"),
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

    const result = validateChangeReferenceToValue(source, target);
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

    const result = applyChangeReferenceToValue(source, target);
    if (!result.success) {
      return { success: false, filesChanged: [], description: result.error };
    }

    writeFileSync(filePath, result.newSource, "utf-8");

    return {
      success: true,
      filesChanged: [file],
      description: `Converted class '${target}' to value object`,
    };
  },
});

interface ValidationResult {
  valid: boolean;
  errors: string[];
}

interface TransformResult {
  success: boolean;
  newSource: string;
  error: string;
}

function validateChangeReferenceToValue(source: string, target: string): ValidationResult {
  const script = `
import ast, json, sys

source = sys.stdin.read()
target = ${JSON.stringify(target)}

try:
    tree = ast.parse(source)
except SyntaxError as e:
    print(json.dumps({"valid": False, "errors": [f"Syntax error: {e}"]}))
    sys.exit(0)

target_cls = None
for node in ast.walk(tree):
    if isinstance(node, ast.ClassDef) and node.name == target:
        target_cls = node
        break

if target_cls is None:
    print(json.dumps({"valid": False, "errors": [f"Class '{target}' not found"]}))
    sys.exit(0)

# Check if already a frozen dataclass
for dec in target_cls.decorator_list:
    if (isinstance(dec, ast.Call)
            and isinstance(dec.func, ast.Name)
            and dec.func.id == "dataclass"):
        for kw in dec.keywords:
            if kw.arg == "frozen":
                val = kw.value
                if isinstance(val, ast.Constant) and val.value:
                    print(json.dumps({"valid": False, "errors": [f"Class '{target}' is already frozen"]}))
                    sys.exit(0)

print(json.dumps({"valid": True, "errors": []}))
`;

  try {
    const output = execFileSync("python3", ["-c", script], {
      encoding: "utf-8",
      input: source,
      timeout: 10_000,
    }).trim();

    const parsed = JSON.parse(output) as { valid: boolean; errors: string[] };
    return parsed;
  } catch (err) {
    return {
      valid: false,
      errors: [err instanceof Error ? err.message : String(err)],
    };
  }
}

function applyChangeReferenceToValue(source: string, target: string): TransformResult {
  const script = `
import ast, json, sys

source = sys.stdin.read()
target = ${JSON.stringify(target)}

tree = ast.parse(source)
lines = source.splitlines(True)

# Find the target class
target_cls = None
for node in ast.walk(tree):
    if isinstance(node, ast.ClassDef) and node.name == target:
        target_cls = node
        break

if target_cls is None:
    print(json.dumps({"success": False, "error": f"Class '{target}' not found"}))
    sys.exit(0)

# Detect if it's a dataclass
is_dataclass = False
dc_decorator = None
for dec in target_cls.decorator_list:
    if isinstance(dec, ast.Name) and dec.id == "dataclass":
        is_dataclass = True
        dc_decorator = dec
        break
    elif (isinstance(dec, ast.Call)
            and isinstance(dec.func, ast.Name)
            and dec.func.id == "dataclass"):
        is_dataclass = True
        dc_decorator = dec
        break
    elif isinstance(dec, ast.Attribute) and dec.attr == "dataclass":
        is_dataclass = True
        dc_decorator = dec
        break
    elif (isinstance(dec, ast.Call)
            and isinstance(dec.func, ast.Attribute)
            and dec.func.attr == "dataclass"):
        is_dataclass = True
        dc_decorator = dec
        break

new_lines = list(lines)

if is_dataclass:
    dec = dc_decorator
    dec_start = dec.lineno - 1  # 0-indexed

    if isinstance(dec, ast.Name):
        # @dataclass -> @dataclass(frozen=True)
        line_text = lines[dec_start]
        indent = line_text[:len(line_text) - len(line_text.lstrip())]
        new_lines[dec_start] = f"{indent}@dataclass(frozen=True)\\n"
    elif isinstance(dec, ast.Call):
        # @dataclass(...) -> @dataclass(..., frozen=True)
        dec_text = ast.get_source_segment(source, dec)
        if dec_text:
            if dec.args or dec.keywords:
                new_dec_text = dec_text[:-1] + ", frozen=True)"
            else:
                new_dec_text = dec_text[:-1] + "frozen=True)"
            line_text = lines[dec_start]
            new_lines[dec_start] = line_text.replace(dec_text, new_dec_text, 1)

    # Update list[X] annotations to tuple[X, ...] for frozen dataclass fields
    for stmt in target_cls.body:
        if isinstance(stmt, ast.AnnAssign) and isinstance(stmt.target, ast.Name):
            ann = stmt.annotation
            ann_text = ast.get_source_segment(source, ann) or ""
            stmt_line = ann.lineno - 1  # 0-indexed
            col_start = ann.col_offset
            col_end = ann.end_col_offset

            new_ann = None
            if ann_text.startswith("list[") and ann_text.endswith("]"):
                inner = ann_text[5:-1]
                new_ann = f"tuple[{inner}, ...]"
            elif ann_text.startswith("List[") and ann_text.endswith("]"):
                inner = ann_text[5:-1]
                new_ann = f"Tuple[{inner}, ...]"

            if new_ann is not None:
                line = new_lines[stmt_line]
                new_lines[stmt_line] = line[:col_start] + new_ann + line[col_end:]
else:
    # Regular class — extract fields from __init__ and add __eq__ + __hash__
    field_names = []
    for stmt in target_cls.body:
        if isinstance(stmt, ast.FunctionDef) and stmt.name == "__init__":
            for s in stmt.body:
                if isinstance(s, ast.Assign):
                    for t in s.targets:
                        if (isinstance(t, ast.Attribute)
                                and isinstance(t.value, ast.Name)
                                and t.value.id == "self"
                                and t.attr not in field_names):
                            field_names.append(t.attr)
                elif isinstance(s, ast.AnnAssign):
                    t = s.target
                    if (isinstance(t, ast.Attribute)
                            and isinstance(t.value, ast.Name)
                            and t.value.id == "self"
                            and t.attr not in field_names):
                        field_names.append(t.attr)
            break

    if not field_names:
        print(json.dumps({"success": False, "error": f"No fields found in __init__ of '{target}'"}))
        sys.exit(0)

    body_indent = " " * target_cls.body[0].col_offset

    comparisons = " and ".join(f"self.{f} == other.{f}" for f in field_names)
    fields_tuple = ", ".join(f"self.{f}" for f in field_names)
    if len(field_names) == 1:
        fields_tuple += ","

    eq_lines = [
        "\\n",
        f"{body_indent}def __eq__(self, other: object) -> bool:\\n",
        f"{body_indent}    return isinstance(other, {target}) and {comparisons}\\n",
        "\\n",
        f"{body_indent}def __hash__(self) -> int:\\n",
        f"{body_indent}    return hash(({fields_tuple}))\\n",
    ]

    end_lineno = target_cls.end_lineno  # 1-indexed, insert at this 0-indexed position
    new_lines[end_lineno:end_lineno] = eq_lines

new_source = "".join(new_lines)

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
