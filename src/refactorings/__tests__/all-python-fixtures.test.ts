import { join, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { mkdtempSync, writeFileSync, readFileSync, rmSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import {
  discoverAllPythonFixtureModules,
  loadPythonFixtureParams,
  runPythonFixtureTest,
} from "../../testing/python-fixture-runner.js";
import "../register-all.js"; // side-effect: populates registry
import { registry } from "../../core/refactoring-registry.js";
import { setPythonContext } from "../../python/python-refactoring-builder.js";
import { createPythonParser } from "../../python/tree-sitter-parser.js";
import type { PyrightClient } from "../../python/pyright-client.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const refactoringsDir = join(__dirname, "..");

const fixtureModules = discoverAllPythonFixtureModules(refactoringsDir);

if (fixtureModules.length === 0) {
  it("has no Python fixtures yet", () => {
    expect(fixtureModules).toHaveLength(0);
  });
}

for (const fixtureModule of fixtureModules) {
  // Python refactorings use kebab-name with "-python" suffix
  const definition =
    registry.lookup(fixtureModule.name + "-python") ?? registry.lookup(fixtureModule.name);

  describe(`[Python] ${definition?.name ?? fixtureModule.name}`, () => {
    if (!definition || definition.language !== "python") {
      it.skip(`has a registered Python refactoring (found: ${definition?.language ?? "none"})`, () => {
        // Skipped
      });
      return;
    }

    for (const fixture of fixtureModule.fixtures) {
      const params = loadPythonFixtureParams(fixture);

      if (!params) {
        it.skip(`preserves semantics: ${fixture.name} (no params exported)`, () => {
          // Skipped — fixture does not export params
        });
        continue;
      }

      it(`preserves semantics: ${fixture.name}`, () => {
        const result = runPythonFixtureTest(fixture, (files) => {
          const tmpDir = mkdtempSync(join(tmpdir(), "py-fixture-apply-"));

          try {
            const fileEntries = [...files.entries()];
            const nameMap = new Map<string, string>(); // originalPath → tmpName
            const isMultiFile = fileEntries.length > 1;

            if (!isMultiFile && params["file"]) {
              // Single-file: write with the name from params
              const [origPath, content] = fileEntries[0] as [string, string];
              const targetFile = params["file"] as string;
              writeFileSync(join(tmpDir, targetFile), content);
              nameMap.set(origPath, targetFile);
            } else {
              // Multi-file: preserve original filenames
              for (const [filePath, content] of files) {
                const fileName = basename(filePath);
                writeFileSync(join(tmpDir, fileName), content);
                nameMap.set(filePath, fileName);
              }
            }

            setPythonContext({
              pyright: null as unknown as PyrightClient,
              parser: createPythonParser(),
              projectRoot: tmpDir,
            });

            const applyResult = definition.apply(null as never, params);
            if (!applyResult.success) {
              throw new Error(`Refactoring failed: ${applyResult.description}`);
            }

            // Read ALL .py files from temp dir back into the result map
            const resultFiles = new Map<string, string>();
            for (const [origPath, tmpName] of nameMap) {
              try {
                resultFiles.set(origPath, readFileSync(join(tmpDir, tmpName), "utf-8"));
              } catch {
                // File may have been deleted by refactoring
              }
            }

            // Also pick up any new .py files created in the temp dir
            for (const entry of readdirSync(tmpDir)) {
              if (!entry.endsWith(".py")) continue;
              const alreadyMapped = [...nameMap.values()].includes(entry);
              if (!alreadyMapped) {
                resultFiles.set(join(tmpDir, entry), readFileSync(join(tmpDir, entry), "utf-8"));
              }
            }

            return resultFiles;
          } finally {
            setPythonContext(null);
            rmSync(tmpDir, { recursive: true, force: true });
          }
        });

        if (!result.passed) {
          throw new Error(result.error ?? "Fixture test failed");
        }

        expect(result.passed).toBe(true);
      });
    }
  });
}
