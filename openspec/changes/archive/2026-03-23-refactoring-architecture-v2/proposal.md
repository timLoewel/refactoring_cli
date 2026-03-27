## Why

After implementing all 66 refactorings, each module carries ~40 lines of identical boilerplate (param validation, file resolution, null checks, type-erased wrappers). The generic `RefactoringDefinition<T>` had to be erased to `unknown` because TypeScript can't store 66 different generic instantiations in one array. Fixtures exist but aren't wired to tests. The barrel import of all 66 modules creates a god-component signal in graph analysis and loads everything at startup.

## What Changes

- New `defineRefactoring` builder that replaces manual interface implementation with a declarative API, cutting per-module boilerplate from ~40 lines to ~10
- Shared target resolvers (`resolveFunction`, `resolveClass`, `resolveVariable`) that eliminate duplicated file-lookup and null-check patterns
- Side-effect self-registration: each refactoring module calls `registry.register()` on import instead of being listed in a barrel array
- Auto-discovered fixture tests: any refactoring with a `fixtures/` directory automatically gets tested through the compile-and-run harness
- **BREAKING**: Remove `diff` field from `RefactoringResult` (always empty, engine computes diffs from snapshots)
- **BREAKING**: Remove `ParamSchema` generic type parameter (already erased, formalize it)

## Capabilities

### New Capabilities

- `refactoring-builder`: The `defineRefactoring` builder API with declarative params, shared resolvers, and automatic registration
- `auto-fixture-tests`: Auto-discovery and execution of fixture tests for all refactorings that have a `fixtures/` directory

### Modified Capabilities

- `refactoring-engine`: Remove `diff` from `RefactoringResult`, simplify `ParamSchema`, add shared target resolvers
- `test-harness`: Integrate fixture auto-discovery with Jest so tests run without manual `.test.ts` files

## Impact

- All 66 refactoring modules rewritten to use the builder (mechanical migration)
- `src/engine/refactoring.types.ts` — simplified interfaces
- `src/engine/apply.ts` — no longer reads `diff` from refactoring result
- `src/refactorings/index.ts` — barrel removed, replaced by dynamic discovery or side-effect imports
- `src/testing/fixture-runner.ts` and `test-helpers.ts` — enhanced for auto-discovery
- No dependency changes, no new packages
