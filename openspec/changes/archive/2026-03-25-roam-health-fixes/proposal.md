## Why

Roam health score is 49/100 with 6 critical issues and 9 warnings. The main problems are: 15 dead exports (unused code), high cognitive complexity in `symbol-resolver.ts` (4 functions above threshold), and high complexity in several refactoring `apply` functions. The ongoing architecture-v2 migration (defineRefactoring builder, self-registration, barrel removal) will address some issues structurally (god component, bottlenecks), but the dead exports and complexity hotspots need targeted cleanup. This change handles what architecture-v2 won't fix, and adds a final quality gate task to the architecture-v2 task list.

## What Changes

- Remove 15 dead exports (primarily in `src/engine/preconditions.ts` — 5 exported functions only used by tests)
- Reduce complexity in `src/engine/symbol-resolver.ts` by extracting shared iteration patterns (`searchSymbols` CC=26, `findUnused` CC=19, `findDeclarationNodes` CC=16, `collectTransitiveRefs` CC=15)
- Reduce complexity in the 2 worst refactoring `apply` functions: `return-modified-value` (CC=25), `consolidate-conditional-expression` (CC=24)
- Add roam health quality gate task to the end of the architecture-v2 task list (target: score >= 60)

## Capabilities

### New Capabilities
- `dead-export-cleanup`: Remove unused exported symbols across the codebase
- `symbol-resolver-simplification`: Extract shared patterns in symbol-resolver.ts to reduce cognitive complexity
- `apply-complexity-reduction`: Reduce complexity in the worst refactoring apply functions

### Modified Capabilities

## Impact

- `src/engine/preconditions.ts` — remove `export` from 5+ unused functions (or delete if truly dead)
- `src/engine/symbol-resolver.ts` — extract helper functions, reduce 4 functions below CC threshold
- `src/refactorings/return-modified-value/index.ts` — extract sub-steps from apply function
- `src/refactorings/consolidate-conditional-expression/index.ts` — extract sub-steps from apply function
- `openspec/changes/refactoring-architecture-v2/tasks.md` — append quality gate tasks
- Tests must continue passing; no behavioral changes
