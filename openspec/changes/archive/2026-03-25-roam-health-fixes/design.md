## Context

Roam health score is 49/100. The ongoing architecture-v2 migration will structurally address the god component (`validate` with 69 callers) and bottleneck issues (`SymbolKind`, `createProgram`) through the defineRefactoring builder and barrel removal. However, three categories of issues need targeted cleanup: dead exports, complexity in `symbol-resolver.ts`, and complexity in refactoring `apply` functions.

The architecture-v2 migration is partially complete (sections 1-3 done, sections 4-9 pending). This change should be sequenced after the architecture-v2 migration completes, as the migration itself will change many of the files involved.

## Goals / Non-Goals

**Goals:**
- Remove all 15 dead exports identified by roam
- Reduce `symbol-resolver.ts` complexity: get all 4 flagged functions below CC=15
- Reduce the 2 worst `apply` functions below CC=20
- Add a quality gate task to architecture-v2 to verify health >= 60

**Non-Goals:**
- Fixing the god component or bottleneck issues (architecture-v2 handles these)
- Reducing complexity in all 16 high-complexity `apply` functions (diminishing returns)
- Achieving a perfect health score

## Decisions

### 1. Dead export removal strategy

**Choice:** Remove `export` keyword from functions only referenced by their co-located test files. Delete functions that are completely unreferenced (no production or test usage).

`preconditions.ts` exports 5 functions (`runPreconditions`, `fileExists`, `fileCompiles`, `symbolExistsInFile`, `lineRangeValid`) plus `PreconditionContext` interface — only imported by `preconditions.test.ts`. The architecture-v2 resolvers (`resolveSourceFile`, `resolveFunction`, etc.) replaced these precondition checks. The functions and their tests can be deleted if the resolvers fully cover their behavior; otherwise, just remove `export`.

**Rationale:** Dead exports inflate the health score and signal unused API surface. Removing exports is safe; deleting requires verifying test coverage is preserved by resolvers.

### 2. Extract shared declaration iteration in symbol-resolver.ts

**Choice:** Create a `forEachDeclaration` generator function that yields `{ name, kind, filePath, line, exported, nameNode }` tuples. Replace the triple-nested loop pattern in `searchSymbols`, `findDeclarationNodes`, and `findUnused`.

```typescript
function* forEachDeclaration(
  project: Project,
  options?: { kind?: SymbolKind; ignoreTests?: boolean }
): Generator<DeclarationEntry> { ... }
```

**Over:** Keeping the duplicated loops.

**Rationale:** Three functions share the same `for sourceFile → for kind → for entry` pattern. A generator avoids materializing intermediate arrays while eliminating the duplication that inflates CC.

### 3. Extract caller-name collection in collectTransitiveRefs

**Choice:** Extract the inner loop that builds `callerNames` set into a standalone `extractCallerNames` function.

**Rationale:** `collectTransitiveRefs` (CC=15) does two things: collect caller names, then find transitive refs. Splitting these drops both halves below the threshold.

### 4. Extract sub-steps in worst apply functions

**Choice:** For `return-modified-value/apply` (CC=25) and `consolidate-conditional-expression/apply` (CC=24), extract logical sub-steps into named helper functions within the same file.

**Rationale:** Each `apply` function does target identification, validation, transformation, and text construction in one body. Extracting these into helpers (e.g., `findReturnTarget`, `buildConsolidatedCondition`) makes each piece independently readable and drops CC.

### 5. Defer roam quality gate until architecture-v2 completes

**Choice:** Disable the roam quality gate during the architecture-v2 migration. Add tasks at the end of the architecture-v2 task list to: (a) run all health fixes from this change, (b) verify health >= 60, (c) re-enable the quality gate.

**Rationale:** The migration touches 66+ files and will temporarily worsen some metrics. Running the quality gate mid-migration would block progress on false positives. The gate becomes meaningful after both the migration and these fixes land.

## Risks / Trade-offs

**[Risk] Precondition functions may still be needed** — The resolvers in architecture-v2 may not cover all precondition edge cases. Mitigation: verify resolver test coverage matches precondition tests before deleting.

**[Risk] Generator pattern may not reduce CC enough** — If the filtering logic inside the loops is complex, extracting the iteration alone may not bring functions below threshold. Mitigation: measure CC after extraction, extract filter predicates separately if needed.

**[Trade-off] Only fixing 2 of 16 high-complexity apply functions** — Diminishing returns on the lower-CC functions (CC 15-17). The architecture-v2 migration will simplify these further by removing boilerplate. Acceptable to defer.
