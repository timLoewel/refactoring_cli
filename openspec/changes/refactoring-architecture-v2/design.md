## Context

The refactoring-cli has 66 refactoring modules, each implementing the `RefactoringDefinition` interface manually. After the initial implementation, four architectural issues emerged: excessive boilerplate, erased generics, disconnected fixture tests, and a monolithic barrel import.

## Goals / Non-Goals

**Goals:**
- Reduce per-refactoring boilerplate from ~40 lines to ~10 with a declarative builder
- Eliminate duplicated file-lookup and null-check patterns via shared resolvers
- Make fixture tests automatic (zero-config) for any refactoring with a `fixtures/` directory
- Remove the barrel import that creates startup cost and false god-component signals
- Clean up dead fields in the type system (`diff` on `RefactoringResult`)

**Non-Goals:**
- Changing refactoring logic or adding new refactorings
- Composable refactoring pipelines (future work)
- Performance optimization beyond removing unnecessary eager imports

## Decisions

### 1. `defineRefactoring` builder function

**Choice:** A single `defineRefactoring()` function that accepts a config object and returns a `RefactoringDefinition`.

```typescript
export default defineRefactoring({
  name: "Extract Variable",
  kebabName: "extract-variable",
  tier: 1,
  description: "...",
  params: [
    fileParam(),
    stringParam("target", "expression to extract"),
    identifierParam("name", "variable name"),
  ],
  resolve: resolveSourceFile,
  apply: (sf, params) => {
    // Only the unique transformation logic
  },
});
```

**Rationale:** Param definitions become composable helpers (`fileParam()`, `stringParam()`, `identifierParam()`). The `resolve` step handles file lookup, null checking, and returns a typed context. The builder handles validation, wrapping, and registration. Each module shrinks to just the transform logic.

### 2. Shared target resolvers

**Choice:** A library of resolver functions that return typed contexts or errors.

```typescript
// Returns { sourceFile } or a failure result
function resolveSourceFile(project, params) { ... }
// Returns { sourceFile, function, body } or a failure result
function resolveFunction(project, params) { ... }
// Returns { sourceFile, class } or a failure result
function resolveClass(project, params) { ... }
```

**Rationale:** Every refactoring starts with the same 10-15 lines of file lookup, function/class finding, and body checking. Extracting these into typed resolvers eliminates ~90% of the duplicated precondition/early-return code.

### 3. Side-effect self-registration

**Choice:** Each refactoring module's default export calls `registry.register()` as a side effect. The CLI entry point dynamically imports all refactoring modules.

```typescript
// src/refactorings/extract-variable/index.ts
export default defineRefactoring({ ... });
// defineRefactoring internally calls registry.register()

// src/cli/index.ts
import "./register-all.js"; // glob-imports all refactoring modules
```

**Over:** Barrel file with explicit imports.

**Rationale:** Eliminates the barrel file (which was a god component with 66 imports). TypeScript doesn't need to know all 66 types at once. A single `register-all.ts` can use a glob-based approach or explicit imports but doesn't need to reference the return types.

### 4. Auto-discovered fixture tests

**Choice:** A single Jest test file that discovers all `fixtures/` directories across refactoring modules and creates test cases dynamically.

```typescript
// src/refactorings/__tests__/all-fixtures.test.ts
const fixtureModules = discoverAllFixtureModules("src/refactorings");
for (const mod of fixtureModules) {
  describe(mod.name, () => {
    for (const fixture of mod.fixtures) {
      it(`preserves semantics: ${fixture.name}`, () => {
        const result = runFixtureTest(fixture, (project) => {
          mod.refactoring.apply(project, fixture.params);
        });
        expect(result.passed).toBe(true);
      });
    }
  });
}
```

**Rationale:** Currently 66 refactorings have fixtures but zero have `.test.ts` files that run them. One auto-discovery test file replaces 66 manual test files.

### 5. Remove `diff` from `RefactoringResult`

**Choice:** Remove the `diff: FileDiff[]` field from `RefactoringResult`.

**Rationale:** Every refactoring returns `diff: []`. The `applyRefactoring` engine function computes diffs from before/after snapshots. The field is dead weight.

## Architecture

```
src/
├── engine/
│   ├── refactoring.types.ts     # Simplified: no diff field, no generic param
│   ├── refactoring-builder.ts   # NEW: defineRefactoring(), param helpers, resolvers
│   ├── refactoring-registry.ts  # Unchanged
│   ├── apply.ts                 # Remove diff from result handling
│   └── ...
├── refactorings/
│   ├── register-all.ts          # NEW: imports all modules for side-effect registration
│   ├── __tests__/
│   │   └── all-fixtures.test.ts # NEW: auto-discovered fixture tests
│   ├── extract-variable/
│   │   ├── index.ts             # Rewritten with defineRefactoring()
│   │   └── fixtures/
│   └── ... (65 more)
└── testing/
    ├── fixture-runner.ts        # Add discoverAllFixtureModules()
    └── test-helpers.ts
```

## Risks / Trade-offs

**[Risk] Migration of 66 modules is mechanical but large** — Each module needs to be rewritten to use the builder. The transformation is predictable (extract the apply logic, delete boilerplate), but touching 66 files in one change is risky. Mitigate: migrate one module first as a template, then batch the rest.

**[Trade-off] Side-effect imports are less explicit** — Barrel imports made the full list visible. Side-effect registration is implicit. Acceptable because `register-all.ts` serves the same documentation purpose and the registry has a `listAll()` method.

**[Trade-off] Shared resolvers add a layer of indirection** — Each refactoring's apply function now receives a pre-resolved context instead of raw `Project`. This is simpler for authors but hides the resolution step. Acceptable because the resolution logic was identical across all modules.
