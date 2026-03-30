import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  discoverPythonFixtures,
  loadPythonFixtureParams,
  runPythonFixture,
  runPythonFixtureTest,
} from "../python-fixture-runner.js";

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "py-fixture-test-"));
}

function writeFile(dir: string, name: string, content: string): void {
  const filePath = path.join(dir, name);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

function firstFixture(dir: string) {
  const fixtures = discoverPythonFixtures(dir);
  expect(fixtures).toHaveLength(1);
  return fixtures[0] as (typeof fixtures)[number];
}

describe("discoverPythonFixtures", () => {
  it("discovers single-file .fixture.py files", () => {
    const dir = createTempDir();
    writeFile(dir, "basic.fixture.py", "def main(): return '42'");
    writeFile(dir, "other.txt", "not a fixture");

    const fixture = firstFixture(dir);
    expect(fixture.name).toBe("basic");
    expect(fixture.type).toBe("single");

    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("discovers multi-file fixture directories with entry.py", () => {
    const dir = createTempDir();
    writeFile(dir, "cross-file/entry.py", "def main(): return '42'");
    writeFile(dir, "cross-file/helper.py", "def help(): return 1");
    writeFile(dir, "not-fixture/foo.py", "x = 1");

    const fixture = firstFixture(dir);
    expect(fixture.name).toBe("cross-file");
    expect(fixture.type).toBe("multi");

    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("returns empty for non-existent directory", () => {
    expect(discoverPythonFixtures("/nonexistent")).toEqual([]);
  });
});

describe("loadPythonFixtureParams", () => {
  it("extracts params dict from fixture", () => {
    const dir = createTempDir();
    const content = `
params = {"file": "main.py", "target": "x", "newName": "y"}

def main():
    x = 42
    return str(x)
`;
    writeFile(dir, "basic.fixture.py", content);

    const params = loadPythonFixtureParams(firstFixture(dir));
    expect(params).toEqual({ file: "main.py", target: "x", newName: "y" });

    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("returns undefined when no params dict exists", () => {
    const dir = createTempDir();
    writeFile(dir, "no-params.fixture.py", "def main(): return '42'");

    const params = loadPythonFixtureParams(firstFixture(dir));
    expect(params).toBeUndefined();

    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe("runPythonFixture", () => {
  it("runs a single-file fixture and captures main() output", () => {
    const dir = createTempDir();
    writeFile(
      dir,
      "basic.fixture.py",
      `
params = {"file": "test.py"}

def main():
    x = 42
    return str(x)
`,
    );

    const output = runPythonFixture(firstFixture(dir));
    expect(output).toBe("42");

    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("runs a multi-file fixture with imports", () => {
    const dir = createTempDir();
    writeFile(
      dir,
      "multi/entry.py",
      `
import helper

params = {"file": "entry.py"}

def main():
    return str(helper.add(1, 2))
`,
    );
    writeFile(
      dir,
      "multi/helper.py",
      `
def add(a, b):
    return a + b
`,
    );

    const output = runPythonFixture(firstFixture(dir));
    expect(output).toBe("3");

    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe("runPythonFixtureTest", () => {
  it("passes when transform changes structure but preserves semantics", () => {
    const dir = createTempDir();
    writeFile(
      dir,
      "rename.fixture.py",
      `
params = {"file": "test.py", "target": "x", "newName": "y"}

def main():
    x = 42
    return str(x)
`,
    );

    const result = runPythonFixtureTest(firstFixture(dir), (files) => {
      const updated = new Map<string, string>();
      for (const [p, content] of files) {
        // Simple rename: x → y (preserves semantics)
        updated.set(p, content.replace(/\bx\b/g, "y"));
      }
      return updated;
    });

    expect(result.passed).toBe(true);
    expect(result.structurallyChanged).toBe(true);
    expect(result.beforeOutput).toBe(result.afterOutput);

    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("fails when transform is a no-op", () => {
    const dir = createTempDir();
    writeFile(
      dir,
      "noop.fixture.py",
      `
params = {"file": "test.py"}

def main():
    return "hello"
`,
    );

    const result = runPythonFixtureTest(firstFixture(dir), (files) => files);

    expect(result.passed).toBe(false);
    expect(result.error).toContain("no-op");

    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("fails when transform breaks semantics", () => {
    const dir = createTempDir();
    writeFile(
      dir,
      "break.fixture.py",
      `
params = {"file": "test.py"}

def main():
    x = 42
    return str(x)
`,
    );

    const result = runPythonFixtureTest(firstFixture(dir), (files) => {
      const updated = new Map<string, string>();
      for (const [p, content] of files) {
        // Change the value — breaks semantics
        updated.set(p, content.replace("42", "99"));
      }
      return updated;
    });

    expect(result.passed).toBe(false);
    expect(result.error).toContain("Output mismatch");

    fs.rmSync(dir, { recursive: true, force: true });
  });
});
