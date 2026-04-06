# scoped-compilation-check Specification

## Purpose
TBD - created by archiving change scoped-compilation-check. Update Purpose after archive.
## Requirements
### Requirement: Reverse import map construction
During candidate enumeration, the test runner SHALL build a reverse import map from the ts-morph `Project` as a side-effect of iterating source files. The map SHALL associate each absolute file path with the set of absolute file paths that directly import it.

#### Scenario: Map populated from import declarations
- **WHEN** `enumerateCandidates` processes a source file `A.ts` that imports `B.ts`
- **THEN** the reverse import map SHALL contain an entry for `B.ts` that includes `A.ts`

#### Scenario: Files with no importers are not in the map
- **WHEN** a source file has no other file importing it
- **THEN** the reverse import map SHALL have no entry for that file (or an empty set)

#### Scenario: Map returned alongside candidates
- **WHEN** `enumerateCandidates` completes
- **THEN** it SHALL return both the `candidates` array and the `reverseImportMap` in a single result object

---

### Requirement: Per-candidate transitive scope computation
Before each apply attempt, the test runner SHALL compute the transitive scope for the candidate file using the reverse import map. The scope SHALL be the set containing the candidate file itself plus all files that transitively import it.

#### Scenario: Direct importer included
- **WHEN** file `B.ts` directly imports `A.ts` (the candidate file)
- **THEN** the scope for `A.ts` SHALL include `B.ts`

#### Scenario: Transitive importer included
- **WHEN** file `C.ts` imports `B.ts` and `B.ts` imports `A.ts` (the candidate)
- **THEN** the scope for `A.ts` SHALL include both `B.ts` and `C.ts`

#### Scenario: Circular imports handled without infinite loop
- **WHEN** the import graph contains a cycle (e.g., `A.ts` ↔ `B.ts`)
- **THEN** scope computation SHALL terminate and each file SHALL appear at most once in the scope

#### Scenario: Candidate file always in scope
- **WHEN** a candidate file has no importers
- **THEN** the scope SHALL contain exactly that one file

---

### Requirement: Scoped tsconfig generation
After a successful apply (CLI returned success), the test runner SHALL write a `tsconfig.scoped.json` to the temp dir root before running tsc. This file SHALL extend the original `tsconfig.json` and override `include` with the computed scope file list, translated to paths within the temp dir.

#### Scenario: Scoped tsconfig extends original
- **WHEN** `tsconfig.scoped.json` is generated
- **THEN** it SHALL contain `"extends": "./tsconfig.json"` so all compiler options are inherited

#### Scenario: Include list contains only scoped files
- **WHEN** `tsconfig.scoped.json` is generated for a candidate with scope `[A.ts, B.ts]`
- **THEN** the `include` array SHALL contain exactly the temp-dir-translated paths for `A.ts` and `B.ts`

#### Scenario: Paths translated from cache dir to temp dir
- **WHEN** the reverse map stores absolute paths under `CACHE_DIR`
- **THEN** each path in the scoped tsconfig `include` SHALL have `CACHE_DIR` replaced with `tempDir`

---

### Requirement: Scoped tsc execution
After a successful apply, the test runner SHALL run `tsc --noEmit --project tsconfig.scoped.json` (using TypeORM's own tsc binary) instead of the previous bare `tsc --noEmit`.

#### Scenario: Scoped tsc detects type error introduced by refactoring
- **WHEN** a refactoring breaks an API consumed by an importer
- **THEN** scoped tsc SHALL exit non-zero and the result SHALL be marked as `passed: false`

#### Scenario: Scoped tsc passes for a correct refactoring
- **WHEN** a refactoring is semantically correct and all importer types remain valid
- **THEN** scoped tsc SHALL exit zero and the result SHALL be marked as `passed: true`

---

### Requirement: Fallback to full-project tsc
If the candidate file is not present in the reverse import map (e.g., the file was outside the enumerated source set), the test runner SHALL fall back to running the full-project `tsc --noEmit` rather than generating a scoped tsconfig.

#### Scenario: Missing map entry triggers fallback
- **WHEN** the candidate file has no entry in the reverse import map
- **THEN** the test runner SHALL run `tsc --noEmit` on the full project without generating `tsconfig.scoped.json`

