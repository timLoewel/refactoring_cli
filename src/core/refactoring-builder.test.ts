import { Project } from "ts-morph";
import { param, resolve, defineRefactoring } from "./refactoring-builder.js";
import { registry } from "./refactoring-registry.js";
import type { RefactoringResult } from "./refactoring.types.js";

let testCounter = 0;
function uniqueKebab(prefix: string): string {
  testCounter += 1;
  return `${prefix}-${testCounter}`;
}

function makeProject(files: Record<string, string>): Project {
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [path, content] of Object.entries(files)) {
    project.createSourceFile(path, content);
  }
  return project;
}

// ---------------------------------------------------------------------------
// Param helpers
// ---------------------------------------------------------------------------

describe("param helpers", () => {
  describe("param.file", () => {
    it("validates a non-empty string", () => {
      const helper = param.file();
      expect(helper.validate({ file: "src/foo.ts" })).toBe("src/foo.ts");
    });

    it("uses default name and description", () => {
      const helper = param.file();
      expect(helper.definition).toEqual({
        name: "file",
        type: "string",
        description: "Path to the TypeScript file",
        required: true,
      });
    });

    it("accepts custom name and description", () => {
      const helper = param.file("target", "Target file");
      expect(helper.definition.name).toBe("target");
      expect(helper.definition.description).toBe("Target file");
    });

    it("throws on missing value", () => {
      const helper = param.file();
      expect(() => helper.validate({})).toThrow("param 'file' must be a non-empty string");
    });

    it("throws on empty string", () => {
      const helper = param.file();
      expect(() => helper.validate({ file: "  " })).toThrow(
        "param 'file' must be a non-empty string",
      );
    });
  });

  describe("param.string", () => {
    it("validates a required string", () => {
      const helper = param.string("target", "expression");
      expect(helper.validate({ target: "x + 1" })).toBe("x + 1");
    });

    it("throws on missing required string", () => {
      const helper = param.string("target", "expression");
      expect(() => helper.validate({})).toThrow("param 'target' must be a non-empty string");
    });

    it("allows undefined for optional param", () => {
      const helper = param.string("note", "optional note", false);
      expect(helper.validate({})).toBeUndefined();
    });

    it("throws on wrong type for optional param", () => {
      const helper = param.string("note", "optional note", false);
      expect(() => helper.validate({ note: 42 })).toThrow("param 'note' must be a string");
    });
  });

  describe("param.identifier", () => {
    it("validates a valid identifier", () => {
      const helper = param.identifier("name", "variable name");
      expect(helper.validate({ name: "myVar" })).toBe("myVar");
    });

    it("accepts identifiers starting with $ or _", () => {
      const helper = param.identifier("name", "variable name");
      expect(helper.validate({ name: "$ref" })).toBe("$ref");
      expect(helper.validate({ name: "_private" })).toBe("_private");
    });

    it("throws on invalid identifier", () => {
      const helper = param.identifier("name", "variable name");
      expect(() => helper.validate({ name: "123abc" })).toThrow(
        "param 'name' must be a valid identifier",
      );
    });

    it("throws on identifier with spaces", () => {
      const helper = param.identifier("name", "variable name");
      expect(() => helper.validate({ name: "my var" })).toThrow(
        "param 'name' must be a valid identifier",
      );
    });

    it("throws on missing required identifier", () => {
      const helper = param.identifier("name", "variable name");
      expect(() => helper.validate({})).toThrow("param 'name' must be a non-empty string");
    });
  });

  describe("param.number", () => {
    it("validates a number", () => {
      const helper = param.number("line", "line number");
      expect(helper.validate({ line: 42 })).toBe(42);
    });

    it("throws on missing required number", () => {
      const helper = param.number("line", "line number");
      expect(() => helper.validate({})).toThrow("param 'line' must be a number");
    });

    it("throws on NaN", () => {
      const helper = param.number("line", "line number");
      expect(() => helper.validate({ line: NaN })).toThrow("param 'line' must be a number");
    });

    it("allows undefined for optional param", () => {
      const helper = param.number("line", "line number", false);
      expect(helper.validate({})).toBeUndefined();
    });

    it("throws on wrong type for optional param", () => {
      const helper = param.number("line", "line number", false);
      expect(() => helper.validate({ line: "42" })).toThrow("param 'line' must be a number");
    });
  });
});

// ---------------------------------------------------------------------------
// Shared resolvers
// ---------------------------------------------------------------------------

describe("shared resolvers", () => {
  describe("resolve.sourceFile", () => {
    it("returns sourceFile on success", () => {
      const project = makeProject({ "src/foo.ts": "export const x = 1;" });
      const result = resolve.sourceFile(project, { file: "src/foo.ts" });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.sourceFile.getFilePath()).toContain("src/foo.ts");
      }
    });

    it("returns failure when file not found", () => {
      const project = makeProject({});
      const result = resolve.sourceFile(project, { file: "missing.ts" });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.result.success).toBe(false);
        expect(result.result.description).toContain("missing.ts");
      }
    });
  });

  describe("resolve.function", () => {
    it("returns function and body on success", () => {
      const project = makeProject({
        "src/foo.ts": "export function greet() { return 'hi'; }",
      });
      const result = resolve.function(project, { file: "src/foo.ts", target: "greet" });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.fn.getName()).toBe("greet");
        expect(result.value.body).toBeDefined();
      }
    });

    it("returns failure when function not found", () => {
      const project = makeProject({ "src/foo.ts": "export const x = 1;" });
      const result = resolve.function(project, { file: "src/foo.ts", target: "greet" });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.result.description).toContain("greet");
      }
    });

    it("returns failure when file not found", () => {
      const project = makeProject({});
      const result = resolve.function(project, { file: "missing.ts", target: "greet" });
      expect(result.ok).toBe(false);
    });
  });

  describe("resolve.class", () => {
    it("returns class on success", () => {
      const project = makeProject({
        "src/foo.ts": "export class MyClass { method() {} }",
      });
      const result = resolve.class(project, { file: "src/foo.ts", target: "MyClass" });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.cls.getName()).toBe("MyClass");
      }
    });

    it("returns failure when class not found", () => {
      const project = makeProject({ "src/foo.ts": "export const x = 1;" });
      const result = resolve.class(project, { file: "src/foo.ts", target: "MyClass" });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.result.description).toContain("MyClass");
      }
    });
  });
});

// ---------------------------------------------------------------------------
// defineRefactoring
// ---------------------------------------------------------------------------

describe("defineRefactoring", () => {
  it("registers the definition in the global registry", () => {
    const kebab = uniqueKebab("test-builder-reg");
    defineRefactoring({
      name: `Test Refactoring ${kebab}`,
      kebabName: kebab,
      tier: 1,
      description: "A test",
      params: [param.file()],
      apply: () => ({ success: true, filesChanged: [], description: "done" }),
    });

    expect(registry.lookup(kebab)).toBeDefined();
    expect(registry.lookup(kebab)?.kebabName).toBe(kebab);
  });

  it("returns a RefactoringDefinition with correct metadata", () => {
    const kebab = uniqueKebab("my-refactoring");
    const def = defineRefactoring({
      name: `My Refactoring ${kebab}`,
      kebabName: kebab,
      tier: 2,
      description: "Does things",
      params: [param.file(), param.string("target", "expression")],
      apply: () => ({ success: true, filesChanged: [], description: "done" }),
    });

    expect(def.name).toBe(`My Refactoring ${kebab}`);
    expect(def.kebabName).toBe(kebab);
    expect(def.tier).toBe(2);
    expect(def.description).toBe("Does things");
    expect(def.params.definitions).toHaveLength(2);
  });

  it("builds ParamSchema that validates params", () => {
    const kebab = uniqueKebab("test-validate");
    const def = defineRefactoring({
      name: `Test ${kebab}`,
      kebabName: kebab,
      tier: 1,
      description: "test",
      params: [param.file(), param.identifier("name", "variable name")],
      apply: () => ({ success: true, filesChanged: [], description: "done" }),
    });

    expect(() => def.params.validate({ file: "foo.ts", name: "myVar" })).not.toThrow();
    expect(() => def.params.validate({})).toThrow();
    expect(() => def.params.validate({ file: "foo.ts", name: "123bad" })).toThrow(
      "valid identifier",
    );
  });

  it("apply works without resolver (receives project directly)", () => {
    let callCount = 0;
    const kebab = uniqueKebab("no-resolver");
    const def = defineRefactoring({
      name: `No Resolver ${kebab}`,
      kebabName: kebab,
      tier: 1,
      description: "test",
      params: [param.file()],
      apply: (_project: Project, _params: Record<string, unknown>): RefactoringResult => {
        callCount += 1;
        return { success: true, filesChanged: ["test.ts"], description: "applied" };
      },
    });

    const project = makeProject({ "test.ts": "const x = 1;" });
    const result = def.apply(project, { file: "test.ts" });

    expect(result.success).toBe(true);
    expect(callCount).toBe(1);
  });

  it("apply with resolver passes resolved context to apply function", () => {
    let receivedContext: unknown = null;
    let receivedParams: unknown = null;
    const kebab = uniqueKebab("with-resolver");

    const def = defineRefactoring({
      name: `With Resolver ${kebab}`,
      kebabName: kebab,
      tier: 1,
      description: "test",
      params: [param.file()],
      resolve: resolve.sourceFile,
      apply: (context, params): RefactoringResult => {
        receivedContext = context;
        receivedParams = params;
        return { success: true, filesChanged: [], description: "applied with context" };
      },
    });

    const project = makeProject({ "src/foo.ts": "const x = 1;" });
    const result = def.apply(project, { file: "src/foo.ts" });

    expect(result.success).toBe(true);
    expect(receivedContext).toHaveProperty("sourceFile");
    expect(receivedParams).toHaveProperty("file", "src/foo.ts");
  });

  it("apply returns failure result when resolver fails", () => {
    let applyCalled = false;
    const kebab = uniqueKebab("resolver-fail");

    const def = defineRefactoring({
      name: `Resolver Fail ${kebab}`,
      kebabName: kebab,
      tier: 1,
      description: "test",
      params: [param.file()],
      resolve: resolve.sourceFile,
      apply: (): RefactoringResult => {
        applyCalled = true;
        return { success: true, filesChanged: [], description: "should not reach" };
      },
    });

    const project = makeProject({});
    const result = def.apply(project, { file: "missing.ts" });

    expect(result.success).toBe(false);
    expect(result.description).toContain("missing.ts");
    expect(applyCalled).toBe(false);
  });

  it("preconditions returns ok when resolver succeeds and no custom preconditions", () => {
    const kebab = uniqueKebab("precond-ok");
    const def = defineRefactoring({
      name: `Precond Ok ${kebab}`,
      kebabName: kebab,
      tier: 1,
      description: "test",
      params: [param.file()],
      resolve: resolve.sourceFile,
      apply: () => ({ success: true, filesChanged: [], description: "done" }),
    });

    const project = makeProject({ "src/foo.ts": "const x = 1;" });
    const precondResult = def.preconditions(project, { file: "src/foo.ts" });

    expect(precondResult.ok).toBe(true);
    expect(precondResult.errors).toHaveLength(0);
  });

  it("preconditions returns failure when resolver fails", () => {
    const kebab = uniqueKebab("precond-fail");
    const def = defineRefactoring({
      name: `Precond Fail ${kebab}`,
      kebabName: kebab,
      tier: 1,
      description: "test",
      params: [param.file()],
      resolve: resolve.sourceFile,
      apply: () => ({ success: true, filesChanged: [], description: "done" }),
    });

    const project = makeProject({});
    const precondResult = def.preconditions(project, { file: "missing.ts" });

    expect(precondResult.ok).toBe(false);
    expect(precondResult.errors[0]).toContain("missing.ts");
  });

  it("preconditions delegates to custom preconditions function", () => {
    const kebab = uniqueKebab("custom-precond");
    const def = defineRefactoring({
      name: `Custom Precond ${kebab}`,
      kebabName: kebab,
      tier: 1,
      description: "test",
      params: [param.file(), param.string("target", "expression")],
      resolve: resolve.sourceFile,
      preconditions: (_context, params) => {
        if (params["target"] === "forbidden") {
          return { ok: false, errors: ["target is forbidden"] };
        }
        return { ok: true, errors: [] };
      },
      apply: () => ({ success: true, filesChanged: [], description: "done" }),
    });

    const project = makeProject({ "src/foo.ts": "const x = 1;" });

    const okResult = def.preconditions(project, { file: "src/foo.ts", target: "x" });
    expect(okResult.ok).toBe(true);

    const failResult = def.preconditions(project, { file: "src/foo.ts", target: "forbidden" });
    expect(failResult.ok).toBe(false);
    expect(failResult.errors).toContain("target is forbidden");
  });
});
