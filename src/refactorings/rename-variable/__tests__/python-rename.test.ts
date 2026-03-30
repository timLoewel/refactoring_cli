import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { setPythonContext } from "../../../python/python-refactoring-builder.js";
import { createPythonParser } from "../../../python/tree-sitter-parser.js";
import type { PyrightClient } from "../../../python/pyright-client.js";
import { registry } from "../../../core/refactoring-registry.js";
import "../python.js"; // side-effect: register

function createTempProject(files: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "py-rename-test-"));
  for (const [name, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, name), content);
  }
  return dir;
}

describe("rename-variable-python", () => {
  const def = registry.lookup("rename-variable-python");

  beforeAll(() => {
    // Set up a mock Python context (no pyright needed for tree-sitter rename)
    setPythonContext({
      pyright: null as unknown as PyrightClient,
      parser: createPythonParser(),
      projectRoot: "/tmp", // will be overridden per test
    });
  });

  afterAll(() => {
    setPythonContext(null);
  });

  it("is registered", () => {
    expect(def).toBeDefined();
    expect(def?.language).toBe("python");
  });

  it("renames a simple variable", () => {
    const dir = createTempProject({
      "test.py": "x = 42\nprint(x)\n",
    });
    setPythonContext({
      pyright: null as unknown as PyrightClient,
      parser: createPythonParser(),
      projectRoot: dir,
    });

    const result = def?.apply(null as never, {
      file: "test.py",
      target: "x",
      newName: "y",
    });

    expect(result?.success).toBe(true);
    const content = fs.readFileSync(path.join(dir, "test.py"), "utf-8");
    expect(content).toContain("y = 42");
    expect(content).toContain("print(y)");
    expect(content).not.toContain("x =");

    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("renames typed variable", () => {
    const dir = createTempProject({
      "test.py": "count: int = 42\nresult = count * 2\n",
    });
    setPythonContext({
      pyright: null as unknown as PyrightClient,
      parser: createPythonParser(),
      projectRoot: dir,
    });

    const result = def?.apply(null as never, {
      file: "test.py",
      target: "count",
      newName: "value",
    });

    expect(result?.success).toBe(true);
    const content = fs.readFileSync(path.join(dir, "test.py"), "utf-8");
    expect(content).toContain("value: int = 42");
    expect(content).toContain("result = value * 2");

    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("handles nested scope correctly", () => {
    const dir = createTempProject({
      "test.py": [
        "x = 10",
        "def inner():",
        "    x = 20",
        "    return x",
        "result = x + inner()",
        "",
      ].join("\n"),
    });
    setPythonContext({
      pyright: null as unknown as PyrightClient,
      parser: createPythonParser(),
      projectRoot: dir,
    });

    // Rename the outer x (line 0)
    const result = def?.apply(null as never, {
      file: "test.py",
      target: "x",
      newName: "outer_x",
      line: 0,
    });

    expect(result?.success).toBe(true);
    const content = fs.readFileSync(path.join(dir, "test.py"), "utf-8");
    // Outer x should be renamed
    expect(content).toContain("outer_x = 10");
    expect(content).toContain("result = outer_x + inner()");
    // Inner x should remain unchanged
    expect(content).toContain("    x = 20");
    expect(content).toContain("    return x");

    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("renames variable in f-string", () => {
    const dir = createTempProject({
      "test.py": 'name = "world"\ngreeting = f"hello {name}!"\n',
    });
    setPythonContext({
      pyright: null as unknown as PyrightClient,
      parser: createPythonParser(),
      projectRoot: dir,
    });

    const result = def?.apply(null as never, {
      file: "test.py",
      target: "name",
      newName: "label",
    });

    expect(result?.success).toBe(true);
    const content = fs.readFileSync(path.join(dir, "test.py"), "utf-8");
    expect(content).toContain('label = "world"');
    expect(content).toContain('f"hello {label}!"');

    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("fails for nonexistent variable", () => {
    const dir = createTempProject({
      "test.py": "x = 42\n",
    });
    setPythonContext({
      pyright: null as unknown as PyrightClient,
      parser: createPythonParser(),
      projectRoot: dir,
    });

    const result = def?.preconditions(null as never, {
      file: "test.py",
      target: "nonexistent",
      newName: "y",
    });

    expect(result?.ok).toBe(false);
    expect(result?.errors[0]).toContain("not found");

    fs.rmSync(dir, { recursive: true, force: true });
  });
});
