import { Project, ts } from "ts-morph";
import { readdirSync, existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

export interface FixtureResult {
  fixtureName: string;
  passed: boolean;
  beforeOutput: string;
  afterOutput: string;
  error?: string;
  structurallyChanged: boolean;
}

export interface Fixture {
  name: string;
  type: "single" | "multi";
  path: string;
}

const TS_COMPILER_OPTIONS = {
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.CommonJS,
  strict: true,
} as const;

export interface FixtureModule {
  name: string;
  refactoringPath: string;
  fixtures: Fixture[];
}

export function discoverAllFixtureModules(refactoringsDir: string): FixtureModule[] {
  if (!existsSync(refactoringsDir)) return [];

  const modules: FixtureModule[] = [];
  const entries = readdirSync(refactoringsDir);

  for (const entry of entries) {
    const entryPath = join(refactoringsDir, entry);
    if (!statSync(entryPath).isDirectory()) continue;

    const fixturesDir = join(entryPath, "fixtures");
    const fixtures = discoverFixtures(fixturesDir);
    if (fixtures.length === 0) continue;

    modules.push({
      name: entry,
      refactoringPath: entryPath,
      fixtures,
    });
  }

  return modules;
}

export function discoverFixtures(fixturesDir: string): Fixture[] {
  if (!existsSync(fixturesDir)) return [];

  const fixtures: Fixture[] = [];
  const entries = readdirSync(fixturesDir);

  for (const entry of entries) {
    const fullPath = join(fixturesDir, entry);
    const stat = statSync(fullPath);

    if (stat.isFile() && entry.endsWith(".fixture.ts")) {
      fixtures.push({ name: entry.replace(".fixture.ts", ""), type: "single", path: fullPath });
    } else if (stat.isDirectory() && existsSync(join(fullPath, "entry.ts"))) {
      fixtures.push({ name: entry, type: "multi", path: fullPath });
    }
  }

  return fixtures;
}

export function runSingleFileFixture(filePath: string): string {
  const content = readFileSync(filePath, "utf-8");
  const jsCode = ts.transpileModule(content, { compilerOptions: TS_COMPILER_OPTIONS }).outputText;
  return executeMain(jsCode);
}

export function runMultiFileFixture(fixtureDir: string): string {
  const project = createInMemoryProject({ outDir: "/virtual-out" });
  loadFilesIntoProject(project, fixtureDir);

  checkCompilation(project);

  const entryFile = project.getSourceFile("entry.ts");
  if (!entryFile) {
    throw new Error("Multi-file fixture must have entry.ts");
  }

  const jsOutput = entryFile
    .getEmitOutput()
    .getOutputFiles()
    .find((f) => f.getFilePath().endsWith(".js"));
  if (!jsOutput) {
    throw new Error("Failed to emit entry.ts");
  }

  const allEmitted = emitAllFiles(project, "/virtual-out/");
  return executeMainWithModules(jsOutput.getText(), allEmitted);
}

export function runFixtureTest(
  fixture: Fixture,
  transform: (project: Project) => void,
): FixtureResult {
  try {
    return runFixtureTestInner(fixture, transform);
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

function runFixtureTestInner(
  fixture: Fixture,
  transform: (project: Project) => void,
): FixtureResult {
  const beforeOutput =
    fixture.type === "single"
      ? runSingleFileFixture(fixture.path)
      : runMultiFileFixture(fixture.path);

  const project = createFixtureProject(fixture);
  const beforeTexts = captureTexts(project);

  transform(project);

  const structurallyChanged = hasStructuralChange(project, beforeTexts);
  const compilationError = getCompilationErrors(project);
  if (compilationError) {
    return failResult(fixture.name, beforeOutput, compilationError, structurallyChanged);
  }

  const afterOutput = runTransformedProject(project, fixture);
  if (typeof afterOutput !== "string") {
    return failResult(fixture.name, beforeOutput, afterOutput.error, structurallyChanged);
  }

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

// --- Helpers ---

function createInMemoryProject(extra: Record<string, unknown> = {}): Project {
  return new Project({
    compilerOptions: { ...TS_COMPILER_OPTIONS, ...extra },
    useInMemoryFileSystem: true,
  });
}

function loadFilesIntoProject(project: Project, dir: string): void {
  const files = readdirSync(dir).filter((f) => f.endsWith(".ts") && f !== "tsconfig.json");
  for (const file of files) {
    const content = readFileSync(join(dir, file), "utf-8");
    project.createSourceFile(file, content);
  }
}

function createFixtureProject(fixture: Fixture): Project {
  const project = createInMemoryProject();
  if (fixture.type === "single") {
    const content = readFileSync(fixture.path, "utf-8");
    project.createSourceFile("fixture.ts", content);
  } else {
    loadFilesIntoProject(project, fixture.path);
  }
  return project;
}

function captureTexts(project: Project): Map<string, string> {
  const texts = new Map<string, string>();
  for (const sf of project.getSourceFiles()) {
    texts.set(sf.getFilePath(), sf.getFullText());
  }
  return texts;
}

function hasStructuralChange(project: Project, beforeTexts: Map<string, string>): boolean {
  for (const sf of project.getSourceFiles()) {
    if (beforeTexts.get(sf.getFilePath()) !== sf.getFullText()) {
      return true;
    }
  }
  return false;
}

function checkCompilation(project: Project): void {
  const error = getCompilationErrors(project);
  if (error) throw new Error(error);
}

function getCompilationErrors(project: Project): string | null {
  const diagnostics = project.getPreEmitDiagnostics();
  const errors = diagnostics.filter((d) => d.getCategory() === ts.DiagnosticCategory.Error);
  if (errors.length === 0) return null;
  const messages = errors.map((e) => e.getMessageText().toString());
  return `Compilation errors after refactoring:\n${messages.join("\n")}`;
}

function emitAllFiles(project: Project, stripPrefix: string): Map<string, string> {
  const allEmitted = new Map<string, string>();
  for (const sf of project.getSourceFiles()) {
    const emitted = sf.getEmitOutput();
    for (const outFile of emitted.getOutputFiles()) {
      const name = outFile.getFilePath().replace(stripPrefix, "").replace(".js", "");
      allEmitted.set(name, outFile.getText());
    }
  }
  return allEmitted;
}

function runTransformedProject(project: Project, fixture: Fixture): string | { error: string } {
  const entryFileName = fixture.type === "single" ? "fixture.ts" : "entry.ts";
  const entryFile = project.getSourceFile(entryFileName);
  if (!entryFile) {
    return { error: "Entry file not found after transformation" };
  }

  if (fixture.type === "single") {
    const jsCode = ts.transpileModule(entryFile.getFullText(), {
      compilerOptions: TS_COMPILER_OPTIONS,
    }).outputText;
    return executeMain(jsCode);
  }

  const allEmitted = emitAllFiles(project, "/");
  const entryJs = entryFile
    .getEmitOutput()
    .getOutputFiles()
    .find((f) => f.getFilePath().endsWith(".js"));
  if (!entryJs) {
    return { error: "Failed to emit entry file" };
  }
  return executeMainWithModules(entryJs.getText(), allEmitted);
}

function failResult(
  fixtureName: string,
  beforeOutput: string,
  error: string,
  structurallyChanged: boolean,
): FixtureResult {
  return { fixtureName, passed: false, beforeOutput, afterOutput: "", error, structurallyChanged };
}

function executeMain(jsCode: string): string {
  const wrappedCode = `
    ${jsCode}
    if (typeof exports.main === 'function') {
      return exports.main();
    }
    throw new Error('Fixture must export a main() function');
  `;
  const fn = new Function("exports", "require", wrappedCode);
  const exports: Record<string, unknown> = {};
  fn(exports, () => ({}));
  return String(exports["main"] ? (exports["main"] as () => string)() : "");
}

function executeMainWithModules(entryJs: string, allModules: Map<string, string>): string {
  const moduleCache = new Map<string, Record<string, unknown>>();

  function customRequire(name: string): Record<string, unknown> {
    const cleanName = name.replace(/^\.\//, "").replace(/\.js$/, "");
    const cached = moduleCache.get(cleanName);
    if (cached) {
      return cached;
    }

    const code = allModules.get(cleanName);
    if (!code) {
      throw new Error(`Module not found: ${name}`);
    }

    const moduleExports: Record<string, unknown> = {};
    moduleCache.set(cleanName, moduleExports);
    const fn = new Function("exports", "require", code);
    fn(moduleExports, customRequire);
    return moduleExports;
  }

  const entryExports: Record<string, unknown> = {};
  const fn = new Function("exports", "require", entryJs);
  fn(entryExports, customRequire);

  if (typeof entryExports["main"] !== "function") {
    throw new Error("Entry fixture must export a main() function");
  }
  return String((entryExports["main"] as () => string)());
}
