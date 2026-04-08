import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { readFileSync, readdirSync } from "node:fs";
import { Project, ts } from "ts-morph";
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
          // First, verify the precondition itself rejects — this is the primary check.
          const precondProject = new Project({
            compilerOptions: {
              target: ts.ScriptTarget.ES2022,
              module: ts.ModuleKind.CommonJS,
              strict: true,
            },
            useInMemoryFileSystem: true,
          });

          if (fixture.type === "single") {
            const content = readFileSync(fixture.path, "utf-8");
            precondProject.createSourceFile("fixture.ts", content);
          } else {
            const dir = fixture.path;
            for (const file of readdirSync(dir).filter(
              (f: string) => f.endsWith(".ts") && f !== "tsconfig.json",
            )) {
              const content = readFileSync(join(dir, file), "utf-8");
              precondProject.createSourceFile(file, content);
            }
          }

          const precondResult = definition.preconditions(precondProject, params);
          if (precondResult.ok) {
            // Precondition didn't catch it — fall back to semantic check
            const result = runFixtureTest(fixture, (project) => {
              definition.apply(project, params);
            });

            if (result.passed) {
              throw new Error(
                `Expected refactoring to reject, but precondition passed (ok: true) ` +
                  `and the refactoring applied successfully preserving semantics. ` +
                  `The precondition is insufficient for this case.`,
              );
            }

            // Acceptable fallback: semantic corruption or error caught the problem
            const threwError = result.error !== undefined && !result.error.includes("no-op");
            const wasNoOp = !result.structurallyChanged;
            expect(threwError || wasNoOp).toBe(true);
          } else {
            // Precondition correctly rejected — pass
            expect(precondResult.ok).toBe(false);
          }
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
