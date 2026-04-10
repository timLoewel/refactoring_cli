import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadProject } from "./project-model.js";

describe("loadProject", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "refactor-test-"));
    writeFileSync(
      join(tempDir, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: { target: "ES2022", strict: true },
        include: ["src/**/*.ts"],
      }),
    );
    mkdirSync(join(tempDir, "src"), { recursive: true });
    writeFileSync(join(tempDir, "src", "index.ts"), "export const x = 1;\n");
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("loads project from --path", () => {
    const result = loadProject({ path: tempDir });
    expect(result.isOk()).toBe(true);
    const model = result._unsafeUnwrap();
    expect(model.projectRoot).toBe(tempDir);
    expect(model.sourceFiles.length).toBeGreaterThanOrEqual(1);
    expect(model.sourceFiles.some((f) => f.endsWith("index.ts"))).toBe(true);
  });

  it("loads project from --config", () => {
    const configPath = join(tempDir, "tsconfig.json");
    const result = loadProject({ config: configPath });
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().projectRoot).toBe(tempDir);
  });

  it("returns err when tsconfig not found", () => {
    const result = loadProject({ path: "/nonexistent/path" });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain(
        "tsconfig.json not found in /nonexistent/path or any parent directory",
      );
    }
  });

  it("returns err when explicit config not found", () => {
    const result = loadProject({ config: "/nonexistent/tsconfig.json" });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain("tsconfig not found");
    }
  });

  it("excludes files matching .refactorignore", () => {
    writeFileSync(join(tempDir, "src", "foo.generated.ts"), "export const y = 2;\n");
    writeFileSync(join(tempDir, ".refactorignore"), "*.generated.ts\n");

    const model = loadProject({ path: tempDir })._unsafeUnwrap();
    expect(model.sourceFiles.some((f) => f.includes("generated"))).toBe(false);
    expect(model.sourceFiles.some((f) => f.endsWith("index.ts"))).toBe(true);
  });

  it("works without .refactorignore", () => {
    const model = loadProject({ path: tempDir })._unsafeUnwrap();
    expect(model.sourceFiles.length).toBeGreaterThanOrEqual(1);
  });

  it("walks up to find tsconfig in parent directory", () => {
    const subDir = join(tempDir, "src", "deep", "nested");
    mkdirSync(subDir, { recursive: true });

    const model = loadProject({ path: subDir })._unsafeUnwrap();
    expect(model.projectRoot).toBe(tempDir);
  });

  it("finds nearest ancestor tsconfig in nested projects", () => {
    // Create a nested tsconfig inside src/
    const nestedRoot = join(tempDir, "src");
    writeFileSync(
      join(nestedRoot, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: { target: "ES2022", strict: true },
        include: ["./**/*.ts"],
      }),
    );

    const deepDir = join(nestedRoot, "deep");
    mkdirSync(deepDir, { recursive: true });

    const model = loadProject({ path: deepDir })._unsafeUnwrap();
    // Should find src/tsconfig.json, not the root one
    expect(model.projectRoot).toBe(nestedRoot);
  });
});
