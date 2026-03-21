import { Project } from "ts-morph";
import {
  runPreconditions,
  fileExists,
  symbolExistsInFile,
  lineRangeValid,
} from "./preconditions.js";

function makeProject(files: Record<string, string>): Project {
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [path, content] of Object.entries(files)) {
    project.createSourceFile(path, content);
  }
  return project;
}

describe("preconditions", () => {
  describe("fileExists", () => {
    it("passes when file exists", () => {
      const project = makeProject({ "src/app.ts": "export const x = 1;" });
      expect(fileExists(project, { filePath: "src/app.ts" })).toBeNull();
    });

    it("fails when file not found", () => {
      const project = makeProject({});
      expect(fileExists(project, { filePath: "missing.ts" })).toContain("not found");
    });

    it("fails when filePath missing", () => {
      const project = makeProject({});
      expect(fileExists(project, {})).toContain("required");
    });
  });

  describe("symbolExistsInFile", () => {
    it("finds variable", () => {
      const project = makeProject({ "a.ts": "const foo = 1;" });
      expect(symbolExistsInFile(project, { filePath: "a.ts", symbolName: "foo" })).toBeNull();
    });

    it("finds function", () => {
      const project = makeProject({ "a.ts": "function bar() {}" });
      expect(symbolExistsInFile(project, { filePath: "a.ts", symbolName: "bar" })).toBeNull();
    });

    it("finds class", () => {
      const project = makeProject({ "a.ts": "class Baz {}" });
      expect(symbolExistsInFile(project, { filePath: "a.ts", symbolName: "Baz" })).toBeNull();
    });

    it("fails when symbol not found", () => {
      const project = makeProject({ "a.ts": "const x = 1;" });
      const err = symbolExistsInFile(project, { filePath: "a.ts", symbolName: "missing" });
      expect(err).toContain("not found");
    });
  });

  describe("lineRangeValid", () => {
    const project = makeProject({});

    it("passes for valid range", () => {
      expect(lineRangeValid(project, { startLine: 1, endLine: 10 })).toBeNull();
    });

    it("fails when startLine < 1", () => {
      expect(lineRangeValid(project, { startLine: 0, endLine: 5 })).toContain(">= 1");
    });

    it("fails when endLine < startLine", () => {
      expect(lineRangeValid(project, { startLine: 10, endLine: 5 })).toContain(">= startLine");
    });

    it("passes when no range specified", () => {
      expect(lineRangeValid(project, {})).toBeNull();
    });
  });

  describe("runPreconditions", () => {
    it("returns ok when all checks pass", () => {
      const project = makeProject({ "a.ts": "const x = 1;" });
      const result = runPreconditions([fileExists], project, { filePath: "a.ts" });
      expect(result.ok).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("collects all errors from failed checks", () => {
      const project = makeProject({});
      const result = runPreconditions([fileExists, lineRangeValid], project, {
        filePath: "missing.ts",
        startLine: 0,
        endLine: 5,
      });
      expect(result.ok).toBe(false);
      expect(result.errors).toHaveLength(2);
    });
  });
});
