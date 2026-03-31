import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import type { PreconditionResult, RefactoringResult } from "../../core/refactoring.types.js";
import { definePythonRefactoring, pythonParam } from "../../python/python-refactoring-builder.js";
import type { PythonProjectContext } from "../../python/python-refactoring-builder.js";

export const replaceConditionalWithPolymorphismPython = definePythonRefactoring({
  name: "Replace Conditional with Polymorphism (Python)",
  kebabName: "replace-conditional-with-polymorphism-python",
  tier: 2,
  description:
    "Replaces a conditional expression in a method with polymorphic subclasses, one per branch.",
  params: [
    pythonParam.file(),
    pythonParam.identifier("target", "Name of the class containing the method to refactor"),
    pythonParam.identifier("method", "Name of the method containing the conditional"),
  ],
  preconditions(ctx: PythonProjectContext, params: Record<string, unknown>): PreconditionResult {
    const errors: string[] = [];
    const file = params["file"] as string;
    const target = params["target"] as string;
    const method = params["method"] as string;

    const filePath = path.resolve(ctx.projectRoot, file);
    let source: string;
    try {
      source = readFileSync(filePath, "utf-8");
    } catch {
      errors.push(`File not found: ${file}`);
      return { ok: false, errors };
    }

    const result = validateRefactoring(source, target, method);
    if (!result.valid) {
      errors.push(...result.errors);
    }

    return { ok: errors.length === 0, errors };
  },
  apply(ctx: PythonProjectContext, params: Record<string, unknown>): RefactoringResult {
    const file = params["file"] as string;
    const target = params["target"] as string;
    const method = params["method"] as string;

    const filePath = path.resolve(ctx.projectRoot, file);
    let source: string;
    try {
      source = readFileSync(filePath, "utf-8");
    } catch {
      return { success: false, filesChanged: [], description: `File not found: ${file}` };
    }

    const result = applyRefactoring(source, target, method);
    if (!result.success) {
      return { success: false, filesChanged: [], description: result.error };
    }

    writeFileSync(filePath, result.newSource, "utf-8");

    return {
      success: true,
      filesChanged: [file],
      description: result.description,
    };
  },
});

interface ValidateResult {
  valid: boolean;
  errors: string[];
}

function validateRefactoring(source: string, target: string, method: string): ValidateResult {
  const targetJ = JSON.stringify(target);
  const methodJ = JSON.stringify(method);

  const script = `
import ast, sys, json

source = sys.stdin.read()
target = ${targetJ}
method_name = ${methodJ}

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
method_node = None
for node in ast.iter_child_nodes(target_cls):
    if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name == method_name:
        method_node = node
        break

if method_node is None:
    errors.append(f"Method '{method_name}' not found in class '{target}'")
    print(json.dumps({"valid": False, "errors": errors}))
    sys.exit(0)

print(json.dumps({"valid": True, "errors": []}))
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
  description: string;
  error: string;
}

function applyRefactoring(source: string, target: string, method: string): ApplyResult {
  const targetJ = JSON.stringify(target);
  const methodJ = JSON.stringify(method);

  const script = `
import ast, sys, json, re

source = sys.stdin.read()
target_name = ${targetJ}
method_name = ${methodJ}

tree = ast.parse(source)
lines = source.splitlines(True)

# Collect all classes at module level
classes = {}
for node in ast.iter_child_nodes(tree):
    if isinstance(node, ast.ClassDef):
        classes[node.name] = node

target_cls = classes[target_name]

method_node = None
for node in ast.iter_child_nodes(target_cls):
    if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name == method_name:
        method_node = node
        break

# Build method signature (excluding self)
def get_sig_params(args):
    parts = []
    regular = list(args.args[1:])  # skip self
    defaults = list(args.defaults)
    offset = len(regular) - len(defaults)
    for i, arg in enumerate(regular):
        s = arg.arg
        if arg.annotation:
            s += ": " + ast.unparse(arg.annotation)
        if i >= offset:
            s += " = " + ast.unparse(defaults[i - offset])
        parts.append(s)
    if args.vararg:
        parts.append("*" + args.vararg.arg)
    if args.kwonlyargs:
        for arg in args.kwonlyargs:
            s = arg.arg
            if arg.annotation:
                s += ": " + ast.unparse(arg.annotation)
            parts.append(s)
    if args.kwarg:
        parts.append("**" + args.kwarg.arg)
    return ", ".join(parts)

return_annotation = ""
if method_node.returns:
    return_annotation = " -> " + ast.unparse(method_node.returns)

sig_params = get_sig_params(method_node.args)

def to_pascal(s):
    return "".join(w.capitalize() for w in re.split(r'[^a-zA-Z0-9]+', s) if w)

# Re-indent a block of source statements to dst_indent.
# src_indent: the original col_offset of the first stmt in the block.
def get_block_text(stmts, src_indent, dst_indent):
    if not stmts:
        return " " * dst_indent + "pass\\n"
    parts = []
    for stmt in stmts:
        start = stmt.lineno - 1
        if hasattr(stmt, 'decorator_list') and stmt.decorator_list:
            start = stmt.decorator_list[0].lineno - 1
        end = stmt.end_lineno
        raw = "".join(lines[start:end])
        for line in raw.splitlines(True):
            stripped = line.lstrip()
            if not stripped or stripped == "\\n":
                parts.append("\\n")
            else:
                current = len(line) - len(line.lstrip())
                extra = max(0, current - src_indent)
                parts.append(" " * (dst_indent + extra) + stripped)
    return "".join(parts)

def build_override_method(name, sig_params, return_annotation, body_text):
    sig = "    def " + name + "(self"
    if sig_params:
        sig += ", " + sig_params
    sig += ")" + return_annotation + ":\\n"
    return sig + body_text

def build_subclass(class_name, base_name, method_text):
    return "class " + class_name + "(" + base_name + "):\\n" + method_text

# ---- Detect conditional pattern ----

body_stmts = method_node.body
# Skip docstring
start_idx = 0
if (body_stmts and isinstance(body_stmts[0], ast.Expr) and
        isinstance(body_stmts[0].value, ast.Constant) and
        isinstance(body_stmts[0].value.value, str)):
    start_idx = 1
effective_body = body_stmts[start_idx:]

pattern = None
branches = []  # [{"label": str, "body_stmts": [...], "src_indent": int}]
default_stmts = None
default_src_indent = None

# Pattern: if isinstance(self, ClassName): ...
def is_isinstance_check(test):
    return (isinstance(test, ast.Call) and
            isinstance(test.func, ast.Name) and
            test.func.id == "isinstance" and
            len(test.args) == 2 and
            isinstance(test.args[0], ast.Name) and
            test.args[0].id == "self" and
            isinstance(test.args[1], ast.Name))

# Pattern: if self.field == "value": ...
def is_type_code_check(test):
    return (isinstance(test, ast.Compare) and
            isinstance(test.left, ast.Attribute) and
            isinstance(test.left.value, ast.Name) and
            test.left.value.id == "self" and
            len(test.ops) == 1 and isinstance(test.ops[0], ast.Eq) and
            len(test.comparators) == 1 and
            isinstance(test.comparators[0], ast.Constant))

if effective_body:
    first = effective_body[0]

    # Check if/elif chain
    if isinstance(first, ast.If):
        current = first
        all_branches = []
        while True:
            test = current.test
            if is_isinstance_check(test):
                class_name = test.args[1].id
                src_indent = current.body[0].col_offset if current.body else 0
                all_branches.append({"label": class_name, "body_stmts": current.body,
                                      "src_indent": src_indent, "pattern": "isinstance"})
            elif is_type_code_check(test):
                label = str(test.comparators[0].value)
                src_indent = current.body[0].col_offset if current.body else 0
                all_branches.append({"label": label, "body_stmts": current.body,
                                      "src_indent": src_indent, "pattern": "type_code"})
            else:
                all_branches = []
                break
            if not current.orelse:
                break
            elif len(current.orelse) == 1 and isinstance(current.orelse[0], ast.If):
                current = current.orelse[0]
            else:
                default_stmts = current.orelse
                default_src_indent = current.orelse[0].col_offset if current.orelse else 0
                break

        if all_branches:
            branches = all_branches
            pattern = all_branches[0]["pattern"]

    # Check match/case (Python 3.10+)
    if pattern is None:
        for stmt in effective_body:
            if isinstance(stmt, ast.Match):
                subject = stmt.subject
                if (isinstance(subject, ast.Attribute) and
                        isinstance(subject.value, ast.Name) and
                        subject.value.id == "self"):
                    for case in stmt.cases:
                        pn = case.pattern
                        if (isinstance(pn, ast.MatchValue) and
                                isinstance(pn.value, ast.Constant)):
                            label = str(pn.value.value)
                            src_indent = case.body[0].col_offset if case.body else 0
                            branches.append({"label": label, "body_stmts": case.body,
                                             "src_indent": src_indent, "pattern": "type_code"})
                        elif isinstance(pn, ast.MatchAs) and pn.name is None:
                            default_stmts = case.body
                            default_src_indent = case.body[0].col_offset if case.body else 0
                    if branches:
                        pattern = "type_code"
                    break

    # Check dict dispatch: var = {"k": expr, ...}; return var.get(self.field, default)
    if pattern is None and len(effective_body) >= 2:
        first_s = effective_body[0]
        last_s = effective_body[-1]
        if (isinstance(first_s, ast.Assign) and
                isinstance(first_s.value, ast.Dict) and
                isinstance(last_s, ast.Return) and
                isinstance(last_s.value, ast.Call) and
                isinstance(last_s.value.func, ast.Attribute) and
                last_s.value.func.attr == "get" and
                len(last_s.value.args) >= 1):
            self_field = last_s.value.args[0]
            if (isinstance(self_field, ast.Attribute) and
                    isinstance(self_field.value, ast.Name) and
                    self_field.value.id == "self"):
                d = first_s.value
                for key, val in zip(d.keys, d.values):
                    if isinstance(key, ast.Constant):
                        val_text = ast.unparse(val)
                        # Create synthetic body: return <val>
                        synthetic_body_text = "        return " + val_text + "\\n"
                        branches.append({"label": str(key.value), "body_stmts": None,
                                         "src_indent": 0, "pattern": "type_code",
                                         "body_text_override": synthetic_body_text})
                if branches:
                    if len(last_s.value.args) >= 2:
                        default_val = ast.unparse(last_s.value.args[1])
                        default_stmts = None
                        # synthetic default body
                        branches_dict_default = "        return " + default_val + "\\n"
                    else:
                        branches_dict_default = "        pass\\n"
                    pattern = "dict"

if not branches or pattern is None:
    print(json.dumps({"success": False, "newSource": "", "description": "",
                       "error": f"No recognized conditional pattern found in '{method_name}'"}))
    sys.exit(0)

# ---- Generate output ----

new_lines = list(lines)
subclass_names = []
subclass_parts = []

DST_BODY_INDENT = 8  # method body indent for module-level subclasses

if pattern == "isinstance":
    # 1. Replace base class method with just the default branch
    if default_stmts is not None:
        new_base_body = get_block_text(default_stmts, default_src_indent, DST_BODY_INDENT)
    else:
        new_base_body = " " * DST_BODY_INDENT + "pass\\n"

    new_method = build_override_method(method_name, sig_params, return_annotation, new_base_body)

    method_start = method_node.lineno - 1
    if method_node.decorator_list:
        method_start = method_node.decorator_list[0].lineno - 1
    method_end = method_node.end_lineno
    new_lines[method_start:method_end] = list(new_method.splitlines(True))

    # 2. Insert override methods into existing subclasses
    # Re-parse to get updated positions
    new_source_tmp = "".join(new_lines)
    tree2 = ast.parse(new_source_tmp)
    lines2 = new_source_tmp.splitlines(True)
    classes2 = {}
    for node in ast.iter_child_nodes(tree2):
        if isinstance(node, ast.ClassDef):
            classes2[node.name] = node

    insertions = []  # (line_idx, lines_to_insert)
    for branch in branches:
        class_name = branch["label"]
        subclass_names.append(class_name)
        body_text = get_block_text(branch["body_stmts"], branch["src_indent"], DST_BODY_INDENT)
        method_text = build_override_method(method_name, sig_params, return_annotation, body_text)
        if class_name in classes2:
            cls = classes2[class_name]
            insertions.append((cls.end_lineno, method_text))

    for insert_at, method_text in sorted(insertions, key=lambda x: x[0], reverse=True):
        insert_lines = ["\\n"] + list(method_text.splitlines(True))
        lines2[insert_at:insert_at] = insert_lines

    new_source = "".join(lines2)

elif pattern in ("type_code", "dict"):
    # Additive: keep base class unchanged, add new subclasses at end
    new_source = source
    for branch in branches:
        label = branch["label"]
        class_name = to_pascal(label) + target_name
        subclass_names.append(class_name)
        if "body_text_override" in branch:
            body_text = branch["body_text_override"]
        else:
            body_text = get_block_text(branch["body_stmts"], branch["src_indent"], DST_BODY_INDENT)
        method_text = build_override_method(method_name, sig_params, return_annotation, body_text)
        subclass_parts.append(build_subclass(class_name, target_name, method_text))

    new_source = new_source.rstrip("\\n") + "\\n"
    for part in subclass_parts:
        new_source += "\\n\\n" + part
    new_source += "\\n"

else:
    new_source = source

try:
    ast.parse(new_source)
except SyntaxError as e:
    print(json.dumps({"success": False, "newSource": "", "description": "",
                       "error": f"Generated invalid Python: {e}"}))
    sys.exit(0)

desc = f"Replaced conditional in '{method_name}' with polymorphic dispatch; subclasses: {', '.join(subclass_names)}"
print(json.dumps({"success": True, "newSource": new_source, "description": desc, "error": ""}))
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
      description: string;
      error: string;
    };

    if (!parsed.success) {
      return { success: false, newSource: "", description: "", error: parsed.error };
    }

    return {
      success: true,
      newSource: parsed.newSource,
      description: parsed.description,
      error: "",
    };
  } catch (err) {
    return {
      success: false,
      newSource: "",
      description: "",
      error: err instanceof Error ? err.message : String(err),
    };
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

void collectPythonFiles;
