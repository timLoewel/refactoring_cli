## Why

The real-codebase test runner uses a generic "all named symbols" candidate list for every refactoring. Each refactoring only accepts a small fraction of those candidates — the rest fail preconditions cheaply. For extract-variable, ~96% of candidates are skipped with "Expression not found in file" after a full daemon RPC round-trip. The same pattern holds for every other refactoring.

The waste compounds: 12,678 candidates × 66 refactorings = 836,748 potential RPC calls, where the vast majority are no-ops that cost 1-3 seconds each.

## What Changes

Add an optional `enumerate(project: Project): Array<{file: string, target: string}>` method to `RefactoringDefinition`. Each refactoring that implements it returns only the candidates it can actually act on, determined by cheap AST traversal with no mutations. The test runner uses `enumerate` when available and falls back to the generic symbol list otherwise.

## Capabilities

### Modified Capabilities

- `refactoring-builder`: `defineRefactoring` accepts an optional `enumerate` field; `RefactoringDefinition` gains the optional method.
- `real-codebase-test-runner`: per-refactoring candidate list comes from `enumerate` when present, falling back to current generic list.

## Impact

- `src/core/refactoring.types.ts`: add `enumerate?` to `RefactoringDefinition`
- `src/core/refactoring-builder.ts`: thread `enumerate` through `defineRefactoring`
- `scripts/test-real-codebase/run.ts`: call `enumerate` per-refactoring when available
- Each refactoring that implements `enumerate`: reads AST, no mutations
