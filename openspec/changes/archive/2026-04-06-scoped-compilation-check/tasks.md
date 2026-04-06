## 1. Reverse import map construction

- [x] 1.1 Change `enumerateCandidates` return type from `Candidate[]` to `{ candidates: Candidate[]; reverseImportMap: Map<string, Set<string>> }`
- [x] 1.2 Inside `enumerateCandidates`, after collecting candidates from each source file, iterate `sf.getImportDeclarations()`, resolve each to its source file, and add `sf.getFilePath()` to the set for that imported file in `reverseImportMap`
- [x] 1.3 Update the call site in `main()` to destructure `{ candidates, reverseImportMap }` from `enumerateCandidates`

## 2. Per-candidate scope computation

- [x] 2.1 Add a `computeScope(file: string, reverseImportMap: Map<string, Set<string>>): Set<string>` helper that runs iterative BFS starting from `file` and returns the transitive importer set including `file` itself
- [x] 2.2 Pass `reverseImportMap` into `applyAndCheck` as a new parameter

## 3. Scoped tsconfig generation and scoped tsc execution

- [x] 3.1 In `applyAndCheck`, after a successful apply, call `computeScope(candidate.file, reverseImportMap)` to get the scope set
- [x] 3.2 Translate each path in the scope set from `CACHE_DIR` to `tempDir`
- [x] 3.3 If the candidate file is found in the map, write `tsconfig.scoped.json` to `tempDir` with `{ "extends": "./tsconfig.json", "include": [...scopedPaths] }`
- [x] 3.4 Run `tsc --noEmit --project tsconfig.scoped.json` (using TypeORM's tsc binary) instead of the previous bare `tsc --noEmit`
- [x] 3.5 If the candidate file is not in the reverse map, fall back to running `tsc --noEmit` on the full project (existing behavior)
