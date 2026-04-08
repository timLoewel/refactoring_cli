import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import {
  discoverAllFixtureModules,
  loadFixtureParams,
  runFixtureTest,
} from "../../testing/fixture-runner.js";
import "../register-all.js"; // side-effect: populates registry
import { registry } from "../../core/refactoring-registry.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const refactoringsDir = join(__dirname, "..");

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
        it(`preserves semantics: ${fixture.name}`, () => {
          throw new Error(
            `Fixture "${fixture.name}" does not export params. ` +
              `Add: export const params = { file: "fixture.ts", target: "...", ... }`,
          );
        });
        continue;
      }

      if (params.expectRejection) {
        it(`rejects precondition: ${fixture.name}`, () => {
          const result = runFixtureTest(fixture, (project) => {
            definition.apply(project, params);
          });

          if (result.passed) {
            throw new Error(
              `Expected refactoring to reject, but it applied successfully and preserved semantics. ` +
                `The precondition is insufficient for this case.`,
            );
          }

          // Acceptable outcomes: threw an error OR produced no structural change (no-op)
          const threwError = result.error !== undefined && !result.error.includes("no-op");
          const wasNoOp = !result.structurallyChanged;
          expect(threwError || wasNoOp).toBe(true);
        });
      } else {
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
    }
  });
}
