import { RefactoringRegistry } from "./refactoring-registry.js";
import type { RefactoringDefinition } from "./refactoring.types.js";

function makeDef(overrides: Partial<RefactoringDefinition> = {}): RefactoringDefinition {
  return {
    name: "Test Refactoring",
    kebabName: "test-refactoring",
    description: "A test refactoring",
    tier: 1,
    params: { definitions: [], validate: (raw) => raw as Record<string, unknown> },
    preconditions: () => ({ ok: true, errors: [] }),
    apply: () => ({ success: true, filesChanged: [], description: "done", diff: [] }),
    ...overrides,
  };
}

describe("RefactoringRegistry", () => {
  let reg: RefactoringRegistry;

  beforeEach(() => {
    reg = new RefactoringRegistry();
  });

  it("registers and looks up by kebab-name", () => {
    reg.register(makeDef());
    expect(reg.lookup("test-refactoring")).toBeDefined();
    expect(reg.lookup("test-refactoring")?.name).toBe("Test Refactoring");
  });

  it("looks up by display name (case-insensitive)", () => {
    reg.register(makeDef());
    expect(reg.lookup("test refactoring")).toBeDefined();
  });

  it("returns undefined for unknown refactoring", () => {
    expect(reg.lookup("nonexistent")).toBeUndefined();
  });

  it("throws on duplicate registration", () => {
    reg.register(makeDef());
    expect(() => reg.register(makeDef())).toThrow("already registered");
  });

  it("lists all refactorings", () => {
    reg.register(makeDef({ kebabName: "a", name: "A" }));
    reg.register(makeDef({ kebabName: "b", name: "B" }));
    expect(reg.listAll()).toHaveLength(2);
  });

  it("filters by tier", () => {
    reg.register(makeDef({ kebabName: "a", name: "A", tier: 1 }));
    reg.register(makeDef({ kebabName: "b", name: "B", tier: 2 }));
    reg.register(makeDef({ kebabName: "c", name: "C", tier: 1 }));
    expect(reg.listByTier(1)).toHaveLength(2);
    expect(reg.listByTier(2)).toHaveLength(1);
    expect(reg.listByTier(3)).toHaveLength(0);
  });

  it("tracks size", () => {
    expect(reg.size).toBe(0);
    reg.register(makeDef());
    expect(reg.size).toBe(1);
  });
});
