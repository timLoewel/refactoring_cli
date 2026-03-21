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

/**
 * Discover all fixtures in a directory.
 * Single-file: *.fixture.ts
 * Multi-file: directories containing entry.ts and tsconfig.json
 */
export function discoverFixtures(fixturesDir: string): Fixture[] {
  if (!existsSync(fixturesDir)) return [];

  const fixtures: Fixture[] = [];
  const entries = readdirSync(fixturesDir);

  for (const entry of entries) {
    const fullPath = join(fixturesDir, entry);
    const stat = statSync(fullPath);

    if (stat.isFile() && entry.endsWith(".fixture.ts")) {
      fixtures.push({
        name: entry.replace(".fixture.ts", ""),
        type: "single",
        path: fullPath,
      });
    } else if (stat.isDirectory() && existsSync(join(fullPath, "entry.ts"))) {
      fixtures.push({
        name: entry,
        type: "multi",
        path: fullPath,
      });
    }
  }

  return fixtures;
}

/**
 * Run a single-file fixture: compile and execute main(), return output.
 */
export function runSingleFileFixture(filePath: string): string {
  const content = readFileSync(filePath, "utf-8");
  const jsCode = ts.transpileModule(content, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      strict: true,
    },
  }).outputText;

  return executeMain(jsCode);
}

/**
 * Run a multi-file fixture: compile all files, execute entry's main().
 */
export function runMultiFileFixture(fixtureDir: string): string {
  const project = new Project({
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      strict: true,
      outDir: "/virtual-out",
    },
    useInMemoryFileSystem: true,
  });

  const files = readdirSync(fixtureDir).filter((f) => f.endsWith(".ts") && f !== "tsconfig.json");
  for (const file of files) {
    const content = readFileSync(join(fixtureDir, file), "utf-8");
    project.createSourceFile(file, content);
  }

  const diagnostics = project.getPreEmitDiagnostics();
  const errors = diagnostics.filter((d) => d.getCategory() === ts.DiagnosticCategory.Error);
  if (errors.length > 0) {
    const messages = errors.map((e) => e.getMessageText().toString());
    throw new Error(`Compilation errors:\n${messages.join("\n")}`);
  }

  const entryFile = project.getSourceFile("entry.ts");
  if (!entryFile) {
    throw new Error("Multi-file fixture must have entry.ts");
  }

  const emitResult = entryFile.getEmitOutput();
  const jsOutput = emitResult.getOutputFiles().find((f) => f.getFilePath().endsWith(".js"));
  if (!jsOutput) {
    throw new Error("Failed to emit entry.ts");
  }

  // For multi-file, we need to emit all files and build a module system
  const allEmitted = new Map<string, string>();
  for (const sf of project.getSourceFiles()) {
    const emitted = sf.getEmitOutput();
    for (const outFile of emitted.getOutputFiles()) {
      const name = outFile.getFilePath().replace("/virtual-out/", "").replace(".js", "");
      allEmitted.set(name, outFile.getText());
    }
  }

  return executeMainWithModules(jsOutput.getText(), allEmitted);
}

/**
 * Run a fixture through the test harness:
 * 1. Compile & run original → beforeOutput
 * 2. Apply transformation to a copy
 * 3. Compile & run transformed → afterOutput
 * 4. Compare outputs
 * 5. Verify structural change
 */
export function runFixtureTest(
  fixture: Fixture,
  transform: (project: Project) => void,
): FixtureResult {
  const fixtureName = fixture.name;

  try {
    // Step 1: Run original
    const beforeOutput =
      fixture.type === "single"
        ? runSingleFileFixture(fixture.path)
        : runMultiFileFixture(fixture.path);

    // Step 2: Create in-memory copy and apply transformation
    const project = new Project({
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.CommonJS,
        strict: true,
      },
      useInMemoryFileSystem: true,
    });

    if (fixture.type === "single") {
      const content = readFileSync(fixture.path, "utf-8");
      project.createSourceFile("fixture.ts", content);
    } else {
      const dir = fixture.path;
      const files = readdirSync(dir).filter((f) => f.endsWith(".ts") && f !== "tsconfig.json");
      for (const file of files) {
        const content = readFileSync(join(dir, file), "utf-8");
        project.createSourceFile(file, content);
      }
    }

    // Capture before text for structural change check
    const beforeTexts = new Map<string, string>();
    for (const sf of project.getSourceFiles()) {
      beforeTexts.set(sf.getFilePath(), sf.getFullText());
    }

    // Apply transformation
    transform(project);

    // Step 3: Check structural change
    let structurallyChanged = false;
    for (const sf of project.getSourceFiles()) {
      const before = beforeTexts.get(sf.getFilePath());
      if (before !== sf.getFullText()) {
        structurallyChanged = true;
        break;
      }
    }

    // Step 4: Compile check
    const diagnostics = project.getPreEmitDiagnostics();
    const errors = diagnostics.filter((d) => d.getCategory() === ts.DiagnosticCategory.Error);
    if (errors.length > 0) {
      const messages = errors.map((e) => e.getMessageText().toString());
      return {
        fixtureName,
        passed: false,
        beforeOutput,
        afterOutput: "",
        error: `Compilation errors after refactoring:\n${messages.join("\n")}`,
        structurallyChanged,
      };
    }

    // Step 5: Run transformed code
    const entryFileName = fixture.type === "single" ? "fixture.ts" : "entry.ts";
    const entryFile = project.getSourceFile(entryFileName);
    if (!entryFile) {
      return {
        fixtureName,
        passed: false,
        beforeOutput,
        afterOutput: "",
        error: "Entry file not found after transformation",
        structurallyChanged,
      };
    }

    let afterOutput: string;
    if (fixture.type === "single") {
      const jsCode = ts.transpileModule(entryFile.getFullText(), {
        compilerOptions: {
          target: ts.ScriptTarget.ES2022,
          module: ts.ModuleKind.CommonJS,
          strict: true,
        },
      }).outputText;
      afterOutput = executeMain(jsCode);
    } else {
      const allEmitted = new Map<string, string>();
      for (const sf of project.getSourceFiles()) {
        const emitted = sf.getEmitOutput();
        for (const outFile of emitted.getOutputFiles()) {
          const name = outFile.getFilePath().replace(/\.js$/, "").replace(/^\//, "");
          allEmitted.set(name, outFile.getText());
        }
      }
      const entryJs = entryFile
        .getEmitOutput()
        .getOutputFiles()
        .find((f) => f.getFilePath().endsWith(".js"));
      if (!entryJs) {
        return {
          fixtureName,
          passed: false,
          beforeOutput,
          afterOutput: "",
          error: "Failed to emit entry file",
          structurallyChanged,
        };
      }
      afterOutput = executeMainWithModules(entryJs.getText(), allEmitted);
    }

    // Step 6: Compare
    const passed = beforeOutput === afterOutput && structurallyChanged;
    return {
      fixtureName,
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
  } catch (error) {
    return {
      fixtureName,
      passed: false,
      beforeOutput: "",
      afterOutput: "",
      error: error instanceof Error ? error.message : String(error),
      structurallyChanged: false,
    };
  }
}

function executeMain(jsCode: string): string {
  // Create a sandboxed execution of the transpiled code
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
