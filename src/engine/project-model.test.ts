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
    const model = loadProject({ path: tempDir });
    expect(model.projectRoot).toBe(tempDir);
    expect(model.sourceFiles.length).toBeGreaterThanOrEqual(1);
    expect(model.sourceFiles.some((f) => f.endsWith("index.ts"))).toBe(true);
  });

  it("loads project from --config", () => {
    const configPath = join(tempDir, "tsconfig.json");
    const model = loadProject({ config: configPath });
    expect(model.projectRoot).toBe(tempDir);
  });

  it("throws when tsconfig not found", () => {
    expect(() => loadProject({ path: "/nonexistent/path" })).toThrow("tsconfig.json not found");
  });

  it("throws when explicit config not found", () => {
    expect(() => loadProject({ config: "/nonexistent/tsconfig.json" })).toThrow(
      "tsconfig not found",
    );
  });

  it("excludes files matching .refactorignore", () => {
    writeFileSync(join(tempDir, "src", "foo.generated.ts"), "export const y = 2;\n");
    writeFileSync(join(tempDir, ".refactorignore"), "*.generated.ts\n");

    const model = loadProject({ path: tempDir });
    expect(model.sourceFiles.some((f) => f.includes("generated"))).toBe(false);
    expect(model.sourceFiles.some((f) => f.endsWith("index.ts"))).toBe(true);
  });

  it("works without .refactorignore", () => {
    const model = loadProject({ path: tempDir });
    expect(model.sourceFiles.length).toBeGreaterThanOrEqual(1);
  });
});
