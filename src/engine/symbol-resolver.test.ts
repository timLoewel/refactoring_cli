import { Project } from "ts-morph";
import { searchSymbols, findReferences, findUnused } from "./symbol-resolver.js";

function makeProject(files: Record<string, string>): Project {
  const project = new Project({
    useInMemoryFileSystem: true,
    compilerOptions: { strict: true },
  });
  for (const [path, content] of Object.entries(files)) {
    project.createSourceFile(path, content);
  }
  return project;
}

describe("searchSymbols", () => {
  it("finds functions by name", () => {
    const project = makeProject({
      "src/math.ts":
        "export function calculateTotal(items: number[]): number { return items.reduce((a, b) => a + b, 0); }",
    });
    const results = searchSymbols(project, "calculateTotal");
    expect(results).toHaveLength(1);
    expect(results[0]?.name).toBe("calculateTotal");
    expect(results[0]?.kind).toBe("function");
    expect(results[0]?.exported).toBe(true);
  });

  it("finds classes by name", () => {
    const project = makeProject({
      "src/app.ts": "export class AppService {}",
    });
    const results = searchSymbols(project, "AppService");
    expect(results).toHaveLength(1);
    expect(results[0]?.kind).toBe("class");
  });

  it("finds variables", () => {
    const project = makeProject({
      "src/config.ts": "export const MAX_RETRIES = 3;",
    });
    const results = searchSymbols(project, "MAX_RETRIES");
    expect(results).toHaveLength(1);
    expect(results[0]?.kind).toBe("variable");
  });

  it("filters by kind", () => {
    const project = makeProject({
      "src/a.ts": "export function parse(): void {} export interface parse {}",
    });
    const results = searchSymbols(project, "parse", { kind: "function" });
    expect(results).toHaveLength(1);
    expect(results[0]?.kind).toBe("function");
  });

  it("filters by exported", () => {
    const project = makeProject({
      "src/a.ts": "export function pub(): void {} function priv(): void {}",
    });
    const allResults = searchSymbols(project, "pub");
    expect(allResults).toHaveLength(1);

    const exportedOnly = searchSymbols(project, "priv", { exported: true });
    expect(exportedOnly).toHaveLength(0);
  });

  it("returns empty for no matches", () => {
    const project = makeProject({ "src/a.ts": "export const x = 1;" });
    expect(searchSymbols(project, "nonexistent")).toHaveLength(0);
  });

  it("finds interfaces", () => {
    const project = makeProject({
      "src/types.ts": "export interface UserConfig { name: string; }",
    });
    const results = searchSymbols(project, "UserConfig");
    expect(results).toHaveLength(1);
    expect(results[0]?.kind).toBe("interface");
  });

  it("finds type aliases", () => {
    const project = makeProject({
      "src/types.ts": "export type ID = string;",
    });
    const results = searchSymbols(project, "ID");
    expect(results).toHaveLength(1);
    expect(results[0]?.kind).toBe("type");
  });

  it("finds enums", () => {
    const project = makeProject({
      "src/status.ts": "export enum Status { Active, Inactive }",
    });
    const results = searchSymbols(project, "Status");
    expect(results).toHaveLength(1);
    expect(results[0]?.kind).toBe("enum");
  });
});

describe("findReferences", () => {
  it("finds references to a function", () => {
    const project = makeProject({
      "src/utils.ts": "export function helper(): number { return 1; }",
      "src/app.ts": 'import { helper } from "./utils";\nconst x = helper();',
    });
    const refs = findReferences(project, "helper");
    expect(refs.length).toBeGreaterThanOrEqual(2); // definition + usage
  });

  it("finds references to a variable", () => {
    const project = makeProject({
      "src/config.ts": "export const LIMIT = 10;",
      "src/app.ts": 'import { LIMIT } from "./config";\nconst x = LIMIT + 1;',
    });
    const refs = findReferences(project, "LIMIT");
    expect(refs.length).toBeGreaterThanOrEqual(2);
  });
});

describe("findUnused", () => {
  it("finds unused exported symbols", () => {
    const project = makeProject({
      "src/utils.ts": "export function used(): void {} export function unused(): void {}",
      "src/app.ts": 'import { used } from "./utils";\nused();',
    });
    const unused = findUnused(project);
    const names = unused.map((u) => u.name);
    expect(names).toContain("unused");
  });

  it("filters unused by kind", () => {
    const project = makeProject({
      "src/a.ts": "export function unusedFn(): void {} export const unusedVar = 1;",
    });
    const unused = findUnused(project, { kind: "function" });
    expect(unused.every((u) => u.kind === "function")).toBe(true);
  });

  it("with ignoreTests, symbols used only in tests are reported as unused", () => {
    const project = makeProject({
      "src/utils.ts": "export function helper(): number { return 1; }",
      "src/utils.test.ts": 'import { helper } from "./utils";\nhelper();',
    });
    const unused = findUnused(project, { ignoreTests: true });
    const names = unused.map((u) => u.name);
    expect(names).toContain("helper");
  });
});
