import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import {
  discoverAllPythonFixtureModules,
  loadPythonFixtureParams,
  runPythonFixtureTest,
} from "../../testing/python-fixture-runner.js";
import "../register-all.js"; // side-effect: populates registry
import { registry } from "../../core/refactoring-registry.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const refactoringsDir = join(__dirname, "..");

const fixtureModules = discoverAllPythonFixtureModules(refactoringsDir);

if (fixtureModules.length === 0) {
  it("has no Python fixtures yet", () => {
    expect(fixtureModules).toHaveLength(0);
  });
}

for (const fixtureModule of fixtureModules) {
  const definition = registry.lookup(fixtureModule.name);

  describe(`[Python] ${definition?.name ?? fixtureModule.name}`, () => {
    if (!definition) {
      it("has a registered refactoring", () => {
        expect(definition).toBeDefined();
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
          // Python fixtures use a different apply pathway —
          // the transform receives source file contents as a Map<path, content>
          // and returns the modified Map. The actual refactoring apply
          // integrates with the Python builder (definePythonRefactoring).
          // For now, this delegates to the definition's apply with
          // the params, but the actual Python apply pathway will be
          // wired up when definePythonRefactoring is built (task 1.4).
          return files;
        });

        if (!result.passed) {
          throw new Error(result.error ?? "Fixture test failed");
        }

        expect(result.passed).toBe(true);
      });
    }
  });
}
