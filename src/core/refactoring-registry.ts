import { ok, err } from "neverthrow";
import type { RefactoringDefinition } from "./refactoring.types.js";
import type { RegistryResult } from "./errors.js";

export class RefactoringRegistry {
  private readonly byKebabName = new Map<string, RefactoringDefinition>();
  private readonly byName = new Map<string, RefactoringDefinition>();

  register(definition: RefactoringDefinition): RegistryResult<void> {
    if (this.byKebabName.has(definition.kebabName)) {
      return err({
        kind: "registry",
        message: `Refactoring already registered: ${definition.kebabName}`,
      });
    }
    this.byKebabName.set(definition.kebabName, definition);
    this.byName.set(definition.name.toLowerCase(), definition);
    return ok(undefined);
  }

  lookup(nameOrKebab: string): RefactoringDefinition | undefined {
    return this.byKebabName.get(nameOrKebab) ?? this.byName.get(nameOrKebab.toLowerCase());
  }

  listAll(): RefactoringDefinition[] {
    return [...this.byKebabName.values()];
  }

  listByTier(tier: 1 | 2 | 3 | 4): RefactoringDefinition[] {
    return this.listAll().filter((r) => r.tier === tier);
  }

  get size(): number {
    return this.byKebabName.size;
  }
}

// Singleton registry
export const registry = new RefactoringRegistry();
