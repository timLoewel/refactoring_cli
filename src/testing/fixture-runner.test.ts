import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { discoverFixtures, runSingleFileFixture, runFixtureTest } from "./fixture-runner.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, "__fixtures__");

describe("discoverFixtures", () => {
  it("discovers single-file fixtures", () => {
    const fixtures = discoverFixtures(join(fixturesDir, "passing"));
    expect(fixtures.length).toBeGreaterThanOrEqual(1);
    expect(fixtures[0]?.type).toBe("single");
    expect(fixtures[0]?.name).toBe("basic");
  });

  it("discovers multi-file fixtures", () => {
    const fixtures = discoverFixtures(join(fixturesDir));
    const multi = fixtures.find((f) => f.type === "multi");
    expect(multi).toBeDefined();
    expect(multi?.name).toBe("multi-file");
  });

  it("returns empty for nonexistent directory", () => {
    expect(discoverFixtures("/nonexistent")).toEqual([]);
  });
});

describe("runSingleFileFixture", () => {
  it("runs basic fixture and returns output", () => {
    const fixturePath = join(fixturesDir, "passing", "basic.fixture.ts");
    const output = runSingleFileFixture(fixturePath);
    expect(output).toBe("3");
  });
});

describe("runFixtureTest", () => {
  it("passes when transformation preserves semantics and changes structure", () => {
    const fixture = {
      name: "basic",
      type: "single" as const,
      path: join(fixturesDir, "passing", "basic.fixture.ts"),
    };

    const result = runFixtureTest(fixture, (project) => {
      // A simple rename that preserves semantics
      const sf = project.getSourceFiles()[0];
      if (sf) {
        const text = sf.getFullText();
        sf.replaceWithText(text.replace("const x = 1", "const a = 1").replace("x + y", "a + y"));
      }
    });

    expect(result.passed).toBe(true);
    expect(result.structurallyChanged).toBe(true);
    expect(result.beforeOutput).toBe("3");
    expect(result.afterOutput).toBe("3");
  });

  it("fails when transformation is a no-op", () => {
    const fixture = {
      name: "basic",
      type: "single" as const,
      path: join(fixturesDir, "passing", "basic.fixture.ts"),
    };

    const result = runFixtureTest(fixture, () => {
      // Do nothing — no-op
    });

    expect(result.passed).toBe(false);
    expect(result.structurallyChanged).toBe(false);
    expect(result.error).toContain("no-op");
  });

  it("captures thrown error for rejection path", () => {
    const fixture = {
      name: "basic",
      type: "single" as const,
      path: join(fixturesDir, "passing", "basic.fixture.ts"),
    };

    const result = runFixtureTest(fixture, () => {
      throw new Error("Precondition failed: target not found");
    });

    expect(result.passed).toBe(false);
    expect(result.error).toContain("Precondition failed");
    expect(result.structurallyChanged).toBe(false);
  });

  it("fails when transformation changes output", () => {
    const fixture = {
      name: "basic",
      type: "single" as const,
      path: join(fixturesDir, "passing", "basic.fixture.ts"),
    };

    const result = runFixtureTest(fixture, (project) => {
      const sf = project.getSourceFiles()[0];
      if (sf) {
        sf.replaceWithText(`export function main(): string { return "999"; }\n`);
      }
    });

    expect(result.passed).toBe(false);
    expect(result.error).toContain("Output mismatch");
  });
});
