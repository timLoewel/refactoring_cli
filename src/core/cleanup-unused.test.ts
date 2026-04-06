import { Project, ts } from "ts-morph";
import { cleanupUnused } from "./cleanup-unused.js";

function createProject(...files: Array<{ name: string; content: string }>) {
  const project = new Project({
    useInMemoryFileSystem: true,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      strict: true,
      noUnusedLocals: true,
    },
  });
  for (const f of files) {
    project.createSourceFile(f.name, f.content);
  }
  return project.getSourceFileOrThrow(files[0]!.name);
}

describe("cleanupUnused", () => {
  it("removes an entirely unused import", () => {
    const sf = createProject(
      {
        name: "test.ts",
        content: `import { Foo } from "./foo";\n\nexport function main(): string {\n  return "hello";\n}\n`,
      },
      { name: "foo.ts", content: `export class Foo {}\n` },
    );
    cleanupUnused(sf);
    expect(sf.getText()).not.toContain("import");
  });

  it("removes only the unused specifier from a multi-specifier import", () => {
    const sf = createProject(
      {
        name: "test.ts",
        content: `import { Foo, Bar } from "./mod";\n\nexport function main(): string {\n  const x: Bar = {} as Bar;\n  return String(x);\n}\n`,
      },
      { name: "mod.ts", content: `export class Foo {}\nexport class Bar {}\n` },
    );
    cleanupUnused(sf);
    const text = sf.getText();
    expect(text).not.toContain("Foo");
    expect(text).toContain("Bar");
  });

  it("removes an unused variable declaration", () => {
    const sf = createProject({
      name: "test.ts",
      content: `export function main(): string {\n  const unused = 42;\n  return "hello";\n}\n`,
    });
    cleanupUnused(sf);
    expect(sf.getText()).not.toContain("unused");
  });

  it("preserves used symbols", () => {
    const sf = createProject({
      name: "test.ts",
      content: `export function main(): string {\n  const used = 42;\n  return String(used);\n}\n`,
    });
    const before = sf.getText();
    cleanupUnused(sf);
    expect(sf.getText()).toBe(before);
  });

  it("handles cascading removals", () => {
    const sf = createProject({
      name: "test.ts",
      content: `export function main(): string {\n  const x = 42;\n  const y = x;\n  return "hello";\n}\n`,
    });
    cleanupUnused(sf);
    const text = sf.getText();
    expect(text).not.toContain("const x");
    expect(text).not.toContain("const y");
  });

  it("does nothing when everything is used", () => {
    const sf = createProject({
      name: "test.ts",
      content: `export function main(): string {\n  const a = 1;\n  const b = a + 1;\n  return String(b);\n}\n`,
    });
    const before = sf.getText();
    cleanupUnused(sf);
    expect(sf.getText()).toBe(before);
  });
});
