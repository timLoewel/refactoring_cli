import { execFileSync } from "node:child_process";
import { readdirSync, existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

export interface PythonFixtureResult {
  fixtureName: string;
  passed: boolean;
  beforeOutput: string;
  afterOutput: string;
  error?: string;
  structurallyChanged: boolean;
}

export interface PythonFixture {
  name: string;
  type: "single" | "multi";
  path: string;
}

export interface PythonFixtureModule {
  name: string;
  refactoringPath: string;
  fixtures: PythonFixture[];
}

export function discoverAllPythonFixtureModules(refactoringsDir: string): PythonFixtureModule[] {
  if (!existsSync(refactoringsDir)) return [];

  const modules: PythonFixtureModule[] = [];
  const entries = readdirSync(refactoringsDir);

  for (const entry of entries) {
    const entryPath = join(refactoringsDir, entry);
    if (!statSync(entryPath).isDirectory()) continue;

    const fixturesDir = join(entryPath, "fixtures");
    const fixtures = discoverPythonFixtures(fixturesDir);
    if (fixtures.length === 0) continue;

    modules.push({
      name: entry,
      refactoringPath: entryPath,
      fixtures,
    });
  }

  return modules;
}

export function discoverPythonFixtures(fixturesDir: string): PythonFixture[] {
  if (!existsSync(fixturesDir)) return [];

  const fixtures: PythonFixture[] = [];
  const entries = readdirSync(fixturesDir);

  for (const entry of entries) {
    const fullPath = join(fixturesDir, entry);
    const stat = statSync(fullPath);

    if (stat.isFile() && entry.endsWith(".fixture.py")) {
      fixtures.push({ name: entry.replace(".fixture.py", ""), type: "single", path: fullPath });
    } else if (stat.isDirectory() && existsSync(join(fullPath, "entry.py"))) {
      fixtures.push({ name: entry, type: "multi", path: fullPath });
    }
  }

  return fixtures;
}

export function loadPythonFixtureParams(
  fixture: PythonFixture,
): Record<string, unknown> | undefined {
  const filePath = fixture.type === "single" ? fixture.path : join(fixture.path, "entry.py");
  if (!existsSync(filePath)) return undefined;

  const content = readFileSync(filePath, "utf-8");

  // Extract params dict from Python source using a simple regex-based approach.
  // The params dict must be a module-level assignment: params = { ... }
  // We use Python itself to evaluate it safely.
  const paramsMatch = /^params\s*=\s*\{/m.test(content);
  if (!paramsMatch) return undefined;

  const script = `
import json, ast, sys
source = open(${JSON.stringify(filePath)}).read()
tree = ast.parse(source)
for node in ast.iter_child_nodes(tree):
    if isinstance(node, ast.Assign):
        for target in node.targets:
            if isinstance(target, ast.Name) and target.id == "params":
                val = ast.literal_eval(node.value)
                print(json.dumps(val))
                sys.exit(0)
print("null")
`;

  try {
    const result = execFileSync("python3", ["-c", script], {
      encoding: "utf-8",
      timeout: 10_000,
    }).trim();
    const parsed = JSON.parse(result);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return undefined;
    return parsed as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

function runPythonFile(filePath: string): string {
  const script = `
import sys, os
sys.path.insert(0, os.path.dirname(${JSON.stringify(filePath)}))
spec = {}
exec(open(${JSON.stringify(filePath)}).read(), spec)
if "main" not in spec or not callable(spec["main"]):
    raise RuntimeError("Fixture must define a main() function")
result = spec["main"]()
print(result, end="")
`;
  return execFileSync("python3", ["-c", script], {
    encoding: "utf-8",
    timeout: 30_000,
  });
}

function runPythonDir(fixtureDir: string): string {
  const entryPath = join(fixtureDir, "entry.py");
  const script = `
import sys, os
sys.path.insert(0, ${JSON.stringify(fixtureDir)})
spec = {}
exec(open(${JSON.stringify(entryPath)}).read(), spec)
if "main" not in spec or not callable(spec["main"]):
    raise RuntimeError("Fixture entry.py must define a main() function")
result = spec["main"]()
print(result, end="")
`;
  return execFileSync("python3", ["-c", script], {
    encoding: "utf-8",
    timeout: 30_000,
  });
}

export function runPythonFixture(fixture: PythonFixture): string {
  return fixture.type === "single" ? runPythonFile(fixture.path) : runPythonDir(fixture.path);
}

export function runPythonFixtureTest(
  fixture: PythonFixture,
  transform: (files: Map<string, string>) => Map<string, string>,
): PythonFixtureResult {
  try {
    return runPythonFixtureTestInner(fixture, transform);
  } catch (error) {
    return {
      fixtureName: fixture.name,
      passed: false,
      beforeOutput: "",
      afterOutput: "",
      error: error instanceof Error ? error.message : String(error),
      structurallyChanged: false,
    };
  }
}

function runPythonFixtureTestInner(
  fixture: PythonFixture,
  transform: (files: Map<string, string>) => Map<string, string>,
): PythonFixtureResult {
  // 1. Capture output before
  const beforeOutput = runPythonFixture(fixture);

  // 2. Read source files
  const beforeFiles = readPythonFixtureFiles(fixture);

  // 3. Apply transformation
  const afterFiles = transform(beforeFiles);

  // 4. Check structural change
  const structurallyChanged = hasStructuralChange(beforeFiles, afterFiles);

  // 5. Write transformed files and run again
  const afterOutput = runTransformedPythonFixture(fixture, afterFiles);

  const passed = beforeOutput === afterOutput && structurallyChanged;
  return {
    fixtureName: fixture.name,
    passed,
    beforeOutput,
    afterOutput,
    error: !structurallyChanged
      ? "Refactoring had no effect (no-op)"
      : beforeOutput !== afterOutput
        ? `Output mismatch:\nBefore: ${beforeOutput}\nAfter: ${afterOutput}`
        : undefined,
    structurallyChanged,
  };
}

function readPythonFixtureFiles(fixture: PythonFixture): Map<string, string> {
  const files = new Map<string, string>();
  if (fixture.type === "single") {
    files.set(fixture.path, readFileSync(fixture.path, "utf-8"));
  } else {
    const entries = readdirSync(fixture.path);
    for (const entry of entries) {
      const fullPath = join(fixture.path, entry);
      if (statSync(fullPath).isFile() && entry.endsWith(".py")) {
        files.set(fullPath, readFileSync(fullPath, "utf-8"));
      }
    }
  }
  return files;
}

function hasStructuralChange(before: Map<string, string>, after: Map<string, string>): boolean {
  for (const [path, content] of before) {
    if (after.get(path) !== content) return true;
  }
  for (const path of after.keys()) {
    if (!before.has(path)) return true;
  }
  return false;
}

function runTransformedPythonFixture(fixture: PythonFixture, files: Map<string, string>): string {
  // Build a script that loads transformed source from stdin-provided JSON
  const filesObj: Record<string, string> = {};
  for (const [path, content] of files) {
    filesObj[path] = content;
  }

  const entryPath = fixture.type === "single" ? fixture.path : join(fixture.path, "entry.py");

  const script = `
import sys, os, json, types, importlib, importlib.abc, importlib.util

files = json.loads(sys.stdin.read())
entry_path = ${JSON.stringify(entryPath)}

# For multi-file fixtures, set up a custom module finder
if ${fixture.type === "multi" ? "True" : "False"}:
    fixture_dir = ${JSON.stringify(fixture.type === "multi" ? fixture.path : "")}

    class FixtureFinder(importlib.abc.MetaPathFinder):
        def find_spec(self, fullname, path, target=None):
            candidate = os.path.join(fixture_dir, fullname + ".py")
            if candidate in files:
                return importlib.util.spec_from_loader(fullname, FixtureLoader(candidate))
            return None

    class FixtureLoader(importlib.abc.Loader):
        def __init__(self, path):
            self.path = path
        def create_module(self, spec):
            return None
        def exec_module(self, module):
            module.__file__ = self.path
            exec(files[self.path], module.__dict__)

    sys.meta_path.insert(0, FixtureFinder())

spec = {}
exec(files[entry_path], spec)
if "main" not in spec or not callable(spec["main"]):
    raise RuntimeError("Fixture must define a main() function")
result = spec["main"]()
print(result, end="")
`;

  return execFileSync("python3", ["-c", script], {
    encoding: "utf-8",
    timeout: 30_000,
    input: JSON.stringify(filesObj),
  });
}
