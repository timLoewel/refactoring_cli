import { PyrightClient } from "../pyright-client.js";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

function createTempProject(files: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pyright-test-"));
  for (const [name, content] of Object.entries(files)) {
    const filePath = path.join(dir, name);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content);
  }
  fs.writeFileSync(path.join(dir, "pyrightconfig.json"), JSON.stringify({ include: ["."] }));
  return dir;
}

function fileUri(dir: string, name: string): string {
  return `file://${path.join(dir, name)}`;
}

// Share one pyright instance across tests to avoid repeated 20s+ startup
describe("PyrightClient", () => {
  let client: PyrightClient;
  let projectDir: string;

  beforeAll(async () => {
    projectDir = createTempProject({
      "main.py": [
        "x: int = 42",
        "print(x)",
        "",
        "def greet(name):",
        "    return name",
        "",
        "result = greet('hello')",
        "",
      ].join("\n"),
    });
    client = new PyrightClient(projectDir);
    await client.ensureReady();
  }, 60_000);

  afterAll(async () => {
    await client.shutdown();
    fs.rmSync(projectDir, { recursive: true, force: true });
  });

  it("resolves hover information", async () => {
    const result = await client.hover(
      fileUri(projectDir, "main.py"),
      { line: 0, character: 0 }, // "x"
    );
    expect(result).not.toBeNull();
    const contents = result?.contents;
    expect(contents).toBeDefined();
    if (typeof contents === "object" && contents !== null && "value" in contents) {
      expect(contents.value).toContain("int");
    }
  }, 30_000);

  it("finds references", async () => {
    const refs = await client.references(
      fileUri(projectDir, "main.py"),
      { line: 3, character: 4 }, // "greet" function name
    );
    // Definition + call site
    expect(refs.length).toBeGreaterThanOrEqual(2);
  }, 30_000);

  it("finds definitions", async () => {
    const defs = await client.definition(
      fileUri(projectDir, "main.py"),
      { line: 6, character: 10 }, // "greet" at the call site
    );
    const defsArray = Array.isArray(defs) ? defs : [defs];
    expect(defsArray.length).toBeGreaterThanOrEqual(1);
    expect(defsArray[0]?.range.start.line).toBe(3);
  }, 30_000);

  it("performs rename", async () => {
    const edit = await client.rename(
      fileUri(projectDir, "main.py"),
      { line: 0, character: 0 }, // "x"
      "y",
    );
    expect(edit).not.toBeNull();
    const changes = edit?.changes;
    expect(changes).toBeDefined();
    if (changes) {
      const uri = fileUri(projectDir, "main.py");
      const fileChanges = changes[uri];
      expect(fileChanges).toBeDefined();
      // Definition (x = 42) + usage (print(x))
      expect(fileChanges?.length).toBeGreaterThanOrEqual(2);
    }
  }, 30_000);

  it("prepares rename", async () => {
    const range = await client.prepareRename(
      fileUri(projectDir, "main.py"),
      { line: 0, character: 0 }, // "x"
    );
    expect(range).not.toBeNull();
    // Should span the identifier "x"
    expect(range?.start.line).toBe(0);
    expect(range?.end.line).toBe(0);
  }, 30_000);
});

describe("PyrightClient lifecycle", () => {
  it("shuts down gracefully (double shutdown is safe)", async () => {
    const dir = createTempProject({ "main.py": "x = 1\n" });
    const c = new PyrightClient(dir);
    await c.ensureReady();
    await c.shutdown();
    await c.shutdown(); // idempotent
    fs.rmSync(dir, { recursive: true, force: true });
  }, 60_000);

  it("recovers after crash by re-initializing on next request", async () => {
    const dir = createTempProject({ "main.py": "x: int = 42\n" });
    const c = new PyrightClient(dir);
    await c.ensureReady();

    // Simulate crash
    const proc = (c as unknown as { process: { kill: () => void } }).process;
    proc.kill();
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Should auto-recover
    const result = await c.hover(`file://${path.join(dir, "main.py")}`, { line: 0, character: 0 });
    expect(result).not.toBeNull();

    await c.shutdown();
    fs.rmSync(dir, { recursive: true, force: true });
  }, 60_000);

  it("blocks on initialization before serving requests", async () => {
    const dir = createTempProject({ "main.py": "x: int = 42\n" });
    const c = new PyrightClient(dir);

    // Do NOT call ensureReady — hover should auto-initialize
    const result = await c.hover(`file://${path.join(dir, "main.py")}`, { line: 0, character: 0 });
    expect(result).not.toBeNull();

    await c.shutdown();
    fs.rmSync(dir, { recursive: true, force: true });
  }, 60_000);
});
