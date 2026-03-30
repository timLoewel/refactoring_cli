import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import type { PreconditionResult, RefactoringResult } from "../../core/refactoring.types.js";
import { definePythonRefactoring, pythonParam } from "../../python/python-refactoring-builder.js";
import type { PythonProjectContext } from "../../python/python-refactoring-builder.js";
import { parsePython } from "../../python/tree-sitter-parser.js";

export const movePythonFunction = definePythonRefactoring({
  name: "Move Function (Python)",
  kebabName: "move-function-python",
  tier: 3,
  description:
    "Moves a Python function from one file to another, rewriting imports in all referencing files.",
  params: [
    pythonParam.file(),
    pythonParam.identifier("target", "Name of the function to move"),
    pythonParam.string("destination", "Destination file path"),
  ],
  preconditions(ctx: PythonProjectContext, params: Record<string, unknown>): PreconditionResult {
    const errors: string[] = [];
    const file = params["file"] as string;
    const target = params["target"] as string;
    const destination = params["destination"] as string;

    const srcPath = path.resolve(ctx.projectRoot, file);
    const destPath = path.resolve(ctx.projectRoot, destination);

    try {
      const source = readFileSync(srcPath, "utf-8");
      const tree = parsePython(source);
      if (!findFunctionDef(tree.rootNode, target)) {
        errors.push(`Function '${target}' not found in ${file}`);
      }
    } catch {
      errors.push(`File not found: ${file}`);
    }

    try {
      readFileSync(destPath, "utf-8");
    } catch {
      errors.push(`Destination file not found: ${destination}`);
    }

    if (file === destination) {
      errors.push("Source and destination must be different files");
    }

    return { ok: errors.length === 0, errors };
  },
  apply(ctx: PythonProjectContext, params: Record<string, unknown>): RefactoringResult {
    const file = params["file"] as string;
    const target = params["target"] as string;
    const destination = params["destination"] as string;

    // Read all Python files in the project
    const pyFiles = discoverPyFiles(ctx.projectRoot);

    // Use a Python script to perform the move with import rewriting
    const result = performMove(ctx.projectRoot, pyFiles, file, destination, target);

    if (!result.success) {
      return { success: false, filesChanged: [], description: result.error };
    }

    // Write modified files
    const filesChanged: string[] = [];
    for (const [filePath, content] of Object.entries(result.files)) {
      writeFileSync(path.resolve(ctx.projectRoot, filePath), content, "utf-8");
      filesChanged.push(filePath);
    }

    return {
      success: true,
      filesChanged,
      description: `Moved function '${target}' from '${file}' to '${destination}'`,
    };
  },
});

function discoverPyFiles(projectRoot: string): string[] {
  const files: string[] = [];
  function walk(dir: string): void {
    for (const entry of readdirSync(dir)) {
      const fullPath = path.join(dir, entry);
      const stat = statSync(fullPath);
      if (
        stat.isDirectory() &&
        entry !== "__pycache__" &&
        entry !== ".git" &&
        entry !== "node_modules"
      ) {
        walk(fullPath);
      } else if (stat.isFile() && entry.endsWith(".py")) {
        files.push(path.relative(projectRoot, fullPath));
      }
    }
  }
  walk(projectRoot);
  return files;
}

interface MoveResult {
  success: boolean;
  files: Record<string, string>;
  error: string;
}

function performMove(
  projectRoot: string,
  pyFiles: string[],
  sourceFile: string,
  destFile: string,
  functionName: string,
): MoveResult {
  // Build file contents map
  const fileContents: Record<string, string> = {};
  for (const f of pyFiles) {
    fileContents[f] = readFileSync(path.resolve(projectRoot, f), "utf-8");
  }

  const script = `
import ast
import sys
import json
import re

data = json.loads(sys.stdin.read())
files = data["files"]
source_file = data["source"]
dest_file = data["dest"]
func_name = data["func"]

# Parse source file and extract the function
source_code = files[source_file]
source_tree = ast.parse(source_code)

# Find the function definition
func_node = None
for node in ast.iter_child_nodes(source_tree):
    if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
        if node.name == func_name:
            func_node = node
            break

if func_node is None:
    print(json.dumps({"success": False, "error": f"Function '{func_name}' not found in {source_file}"}))
    sys.exit(0)

# Extract function text from source (including decorators)
source_lines = source_code.splitlines(True)
start_line = func_node.lineno - 1
if func_node.decorator_list:
    start_line = func_node.decorator_list[0].lineno - 1
end_line = func_node.end_lineno  # end_lineno is 1-based inclusive

func_text = "".join(source_lines[start_line:end_line])

# Remove function from source file
new_source_lines = source_lines[:start_line] + source_lines[end_line:]
# Clean up extra blank lines at the removal point
new_source = "".join(new_source_lines)
# Remove trailing blank lines that pile up
while new_source.endswith("\\n\\n\\n"):
    new_source = new_source[:-1]

# Analyze what names the function uses that come from imports
class NameCollector(ast.NodeVisitor):
    """Collect all names referenced inside a function."""
    def __init__(self):
        self.names = set()
    def visit_Name(self, node):
        self.names.add(node.id)
        self.generic_visit(node)
    def visit_Attribute(self, node):
        # Collect top-level name in a.b.c → 'a'
        n = node
        while isinstance(n, ast.Attribute):
            n = n.value
        if isinstance(n, ast.Name):
            self.names.add(n.id)
        self.generic_visit(node)

collector = NameCollector()
collector.visit(func_node)
func_names = collector.names

# Find imports in source file that provide names used by the function
source_imports = []
for node in ast.iter_child_nodes(source_tree):
    if isinstance(node, ast.Import):
        for alias in node.names:
            local_name = alias.asname or alias.name
            if local_name in func_names:
                source_imports.append(source_lines[node.lineno - 1].rstrip("\\n"))
    elif isinstance(node, ast.ImportFrom):
        needed_names = []
        for alias in node.names:
            local_name = alias.asname or alias.name
            if local_name in func_names:
                needed_names.append(alias)
        if needed_names:
            # Reconstruct import statement with only the needed names
            names_str = ", ".join(
                f"{a.name} as {a.asname}" if a.asname else a.name
                for a in needed_names
            )
            module = node.module or ""
            level = "." * node.level
            source_imports.append(f"from {level}{module} import {names_str}")

# Build destination: imports needed by the function + the function itself
dest_code = files[dest_file]
dest_imports_to_add = []
for imp_stmt in source_imports:
    # Only add if not already in destination
    if imp_stmt not in dest_code:
        dest_imports_to_add.append(imp_stmt)

import_block = "\\n".join(dest_imports_to_add)
if dest_code.strip():
    if import_block:
        new_dest = dest_code.rstrip("\\n") + "\\n\\n" + import_block + "\\n\\n" + func_text
    else:
        new_dest = dest_code.rstrip("\\n") + "\\n\\n" + func_text
else:
    if import_block:
        new_dest = import_block + "\\n\\n" + func_text
    else:
        new_dest = func_text

# Compute module names from file paths
def file_to_module(filepath):
    """Convert file path to Python module name."""
    return filepath.replace("/", ".").replace("\\\\", ".").removesuffix(".py")

source_module = file_to_module(source_file)
dest_module = file_to_module(dest_file)

# Rewrite imports in all files
modified_files = {}
modified_files[source_file] = new_source
modified_files[dest_file] = new_dest

for filepath, content in files.items():
    if filepath in (source_file, dest_file):
        continue

    tree = ast.parse(content)
    lines = content.splitlines(True)
    edits = []  # (line_idx, old_text, new_text)

    for node in ast.iter_child_nodes(tree):
        # Handle: from source_module import func_name
        if isinstance(node, ast.ImportFrom):
            if node.module == source_module:
                for alias in node.names:
                    if alias.name == func_name:
                        # Rewrite to import from dest_module
                        old_line = lines[node.lineno - 1]
                        new_line = old_line.replace(
                            f"from {source_module} import",
                            f"from {dest_module} import"
                        )
                        edits.append((node.lineno - 1, new_line))
                        break

        # Handle: import source_module / import source_module as alias
        elif isinstance(node, ast.Import):
            for alias in node.names:
                if alias.name == source_module:
                    # Check if func_name is used via module.func_name
                    # Need to add import for dest module and rewrite usages
                    # This is more complex — for now, add dest import
                    pass

    if edits:
        for line_idx, new_line in edits:
            lines[line_idx] = new_line
        modified_files[filepath] = "".join(lines)

# Also handle import-module style in caller files
# Look for patterns like: source_module.func_name
for filepath, content in files.items():
    if filepath in modified_files and filepath not in (source_file, dest_file):
        content = modified_files[filepath]
    elif filepath in (source_file, dest_file):
        continue

    tree = ast.parse(content)
    lines = content.splitlines(True)
    needs_dest_import = False
    has_module_import = False
    module_alias = None
    import_line = -1

    for node in ast.iter_child_nodes(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                if alias.name == source_module:
                    has_module_import = True
                    module_alias = alias.asname or alias.name
                    import_line = node.lineno - 1

    if has_module_import and module_alias:
        # Check if module_alias.func_name is used
        pattern = re.escape(module_alias) + r"\\." + re.escape(func_name)
        new_content = "".join(lines)

        if re.search(pattern, new_content):
            # Replace module.func references with dest_module.func
            dest_alias = dest_module.split(".")[-1] if "." in dest_module else dest_module
            new_content = re.sub(
                re.escape(module_alias) + r"\\." + re.escape(func_name),
                dest_alias + "." + func_name,
                new_content
            )

            # Add import for dest module if not already there
            if f"import {dest_module}" not in new_content:
                # Find import line and add after it
                new_lines = new_content.splitlines(True)
                # Insert dest import after the source import line
                dest_import = f"import {dest_module}"
                if module_alias and module_alias != source_module:
                    # Preserve alias style: import X as alias → import dest as alias
                    dest_import = f"import {dest_module} as {dest_alias}"
                new_lines.insert(import_line + 1, dest_import + "\\n")
                new_content = "".join(new_lines)

            modified_files[filepath] = new_content

result = {"success": True, "files": modified_files}
print(json.dumps(result))
`;

  const inputData = JSON.stringify({
    files: fileContents,
    source: sourceFile,
    dest: destFile,
    func: functionName,
  });

  try {
    const output = execFileSync("python3", ["-c", script], {
      encoding: "utf-8",
      input: inputData,
      timeout: 30_000,
    }).trim();

    const parsed = JSON.parse(output) as {
      success: boolean;
      files?: Record<string, string>;
      error?: string;
    };

    if (!parsed.success) {
      return { success: false, files: {}, error: parsed.error ?? "Unknown error" };
    }

    return {
      success: true,
      files: parsed.files ?? {},
      error: "",
    };
  } catch (err) {
    return {
      success: false,
      files: {},
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function findFunctionDef(
  node: {
    type: string;
    text: string;
    childCount: number;
    child: (i: number) => typeof node | null;
  },
  name: string,
): boolean {
  if (
    (node.type === "function_definition" || node.type === "decorated_definition") &&
    node.text.includes(`def ${name}`)
  ) {
    return true;
  }
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child && findFunctionDef(child, name)) return true;
  }
  return false;
}
