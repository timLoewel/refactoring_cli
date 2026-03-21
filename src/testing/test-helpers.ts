import type { Project } from "ts-morph";
import type { Fixture, FixtureResult } from "./fixture-runner.js";
import { discoverFixtures, runFixtureTest } from "./fixture-runner.js";

/**
 * Run all fixtures for a refactoring and return results.
 * Intended to be called from Jest test files.
 */
export function testRefactoring(
  fixturesDir: string,
  transform: (project: Project) => void,
): FixtureResult[] {
  const fixtures = discoverFixtures(fixturesDir);
  return fixtures.map((f) => runFixtureTest(f, transform));
}

/**
 * Jest helper: creates a describe block for each fixture in a directory.
 */
export function describeRefactoring(
  name: string,
  fixturesDir: string,
  transform: (project: Project, fixture: Fixture) => void,
): void {
  const fixtures = discoverFixtures(fixturesDir);

  describe(name, () => {
    for (const fixture of fixtures) {
      it(`preserves semantics: ${fixture.name}`, () => {
        const result = runFixtureTest(fixture, (project) => transform(project, fixture));
        expect(result.passed).toBe(true);
        if (!result.passed && result.error) {
          fail(result.error);
        }
      });
    }
  });
}
