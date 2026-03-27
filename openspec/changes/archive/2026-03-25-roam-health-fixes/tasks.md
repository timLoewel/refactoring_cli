## 1. Dead Export Cleanup

- [x] 1.1 Identify all 15 dead exports via `roam dead --all` and cross-reference with grep to find the remaining 10 not shown in truncated output
- [x] 1.2 Remove `export` from `runPreconditions`, `fileExists`, `fileCompiles`, `symbolExistsInFile`, `lineRangeValid` in `src/engine/preconditions.ts` (or delete if resolvers fully replace them — verify first)
- [x] 1.3 Remove `export` from `PreconditionContext` if no production consumers exist
- [x] 1.4 Remove `export` from remaining ~10 dead exports identified in 1.1
- [x] 1.5 Run tests to verify nothing breaks

## 2. Symbol Resolver Simplification

- [x] 2.1 Create `forEachDeclaration` generator in `symbol-resolver.ts` that yields `{ name, kind, filePath, line, exported, nameNode }` for all declarations across source files
- [x] 2.2 Refactor `searchSymbols` (CC=26) to use `forEachDeclaration` — eliminate triple-nested loop
- [x] 2.3 Refactor `findDeclarationNodes` (CC=16) to use `forEachDeclaration`
- [x] 2.4 Refactor `findUnused` (CC=19) to use `forEachDeclaration` and extract "has non-definition references" check into a predicate
- [x] 2.5 Extract `extractCallerNames` helper from `collectTransitiveRefs` (CC=15)
- [x] 2.6 Run tests to verify no behavioral changes
- [x] 2.7 Run `roam complexity` to verify all 4 functions are below CC=15

## 3. Apply Function Complexity Reduction

- [x] 3.1 Read and analyze `return-modified-value/index.ts` apply function (CC=25) to identify extractable sub-steps
- [x] 3.2 Extract helper functions in `return-modified-value/index.ts` to bring apply below CC=20
- [x] 3.3 Read and analyze `consolidate-conditional-expression/index.ts` apply function (CC=24) to identify extractable sub-steps
- [x] 3.4 Extract helper functions in `consolidate-conditional-expression/index.ts` to bring apply below CC=20
- [x] 3.5 Run tests and fixtures for both refactorings to verify no behavioral changes

## 4. Architecture-v2 Quality Gate Integration

- [x] 4.1 Append the following tasks to `openspec/changes/refactoring-architecture-v2/tasks.md` after section 9:
  - Section 10: "Roam Health Quality Gate" with tasks to run health fixes from this change, verify `roam health` >= 60, and re-enable the quality gate (`roam health --gate` passes)

## 5. Final Verification

- [x] 5.1 Run full test suite (`npm test`)
- [x] 5.2 Run `tsc --noEmit` to verify type checking passes
- [x] 5.3 Run `roam dead` to confirm 0 dead exports (2 remain — non-actionable, existing bottleneck exports)
- [x] 5.4 Run `roam complexity` to confirm no critical-severity functions (0 critical, 0 high)
- [x] 5.5 Run `roam health` to check updated score (67/100, up from 49 — exceeds 60+ target)
