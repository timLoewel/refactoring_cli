import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import {
  discoverAllFixtureModules,
  loadFixtureParams,
  runFixtureTest,
} from "../../testing/fixture-runner.js";
import { registerAll } from "../index.js";
import { registry } from "../../engine/refactoring-registry.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const refactoringsDir = join(__dirname, "..");

// Register all refactorings so registry.lookup() works
registerAll();

const fixtureModules = discoverAllFixtureModules(refactoringsDir);

for (const fixtureModule of fixtureModules) {
  const definition = registry.lookup(fixtureModule.name);

  describe(definition?.name ?? fixtureModule.name, () => {
    if (!definition) {
      it("has a registered refactoring", () => {
        expect(definition).toBeDefined();
      });
      return;
    }

    for (const fixture of fixtureModule.fixtures) {
      const params = loadFixtureParams(fixture);

      if (!params) {
        it.skip(`preserves semantics: ${fixture.name} (no params exported)`, () => {
          // Skipped — fixture does not export params
        });
        continue;
      }

      it(`preserves semantics: ${fixture.name}`, () => {
        const result = runFixtureTest(fixture, (project) => {
          definition.apply(project, params);
        });

        if (!result.passed) {
          throw new Error(result.error ?? "Fixture test failed");
        }

        expect(result.passed).toBe(true);
      });
    }
  });
}
