import { Project } from "ts-morph";
import { ok } from "neverthrow";
import { applyRefactoring } from "./apply.js";
import type { RefactoringDefinition } from "./refactoring.types.js";

function makeProject(files: Record<string, string>): Project {
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [path, content] of Object.entries(files)) {
    project.createSourceFile(path, content);
  }
  return project;
}

function makeDefinition(overrides: Partial<RefactoringDefinition> = {}): RefactoringDefinition {
  return {
    name: "Test",
    kebabName: "test",
    description: "test",
    tier: 1 as const,
    language: "typescript" as const,
    params: {
      definitions: [],
      validate: (raw: unknown) => ok(raw as Record<string, unknown>),
    },
    preconditions: () => ({ ok: true, errors: [] }),
    apply: (project: Project) => {
      const sf = project.getSourceFiles()[0];
      if (sf) {
        sf.replaceWithText("export const x = 2;\n");
      }
      return { success: true, filesChanged: ["test.ts"], description: "changed x" };
    },
    ...overrides,
  };
}

describe("applyRefactoring", () => {
  it("applies transformation and returns diffs", () => {
    const project = makeProject({ "test.ts": "export const x = 1;\n" });
    const def = makeDefinition();
    const result = applyRefactoring(def, project, {});

    expect(result.success).toBe(true);
    expect(result.diff.length).toBeGreaterThan(0);
    expect(result.diff[0]?.before).toContain("x = 1");
    expect(result.diff[0]?.after).toContain("x = 2");
  });

  it("returns diffs without writing in dry-run mode", () => {
    const project = makeProject({ "test.ts": "export const x = 1;\n" });
    const def = makeDefinition();
    const result = applyRefactoring(def, project, {}, { dryRun: true });

    expect(result.success).toBe(true);
    expect(result.diff.length).toBeGreaterThan(0);
    // File should be reverted in dry-run
    const sf = project.getSourceFiles()[0];
    expect(sf?.getFullText()).toContain("x = 1");
  });

  it("fails when preconditions fail", () => {
    const project = makeProject({ "test.ts": "export const x = 1;\n" });
    const def = makeDefinition({
      preconditions: () => ({ ok: false, errors: ["Something is wrong"] }),
    });
    const result = applyRefactoring(def, project, {});

    expect(result.success).toBe(false);
    expect(result.description).toContain("Precondition failed");
    expect(result.filesChanged).toHaveLength(0);
  });

  it("rolls back on transformation error", () => {
    const project = makeProject({ "test.ts": "export const x = 1;\n" });
    const def = makeDefinition({
      apply: () => {
        throw new Error("Transformation exploded");
      },
    });
    const result = applyRefactoring(def, project, {});

    expect(result.success).toBe(false);
    expect(result.description).toContain("Transformation error");
    const sf = project.getSourceFiles()[0];
    expect(sf?.getFullText()).toContain("x = 1");
  });

  it("rolls back when apply returns failure", () => {
    const project = makeProject({ "test.ts": "export const x = 1;\n" });
    const def = makeDefinition({
      apply: (p: Project) => {
        const sf = p.getSourceFiles()[0];
        if (sf) sf.replaceWithText("export const x = 999;\n");
        return { success: false, filesChanged: [], description: "nope" };
      },
    });
    const result = applyRefactoring(def, project, {});

    expect(result.success).toBe(false);
    const sf = project.getSourceFiles()[0];
    expect(sf?.getFullText()).toContain("x = 1");
  });
});
