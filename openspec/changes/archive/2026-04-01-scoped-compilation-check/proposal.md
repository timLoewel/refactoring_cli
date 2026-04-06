## Why

The real-codebase test runner runs `tsc --noEmit` on the full TypeORM project after every successful apply (~15s per candidate). This makes a full run impractical. The enumeration step already loads the entire project into ts-morph — the import graph needed to scope compilation is a free side-product of that scan.

## What Changes

- During enumeration the test runner builds a **reverse import map**: for each source file, the set of files that (transitively) import it.
- Per candidate, the scope is pre-computed as `{candidate file} ∪ transitive importers` before any apply runs.
- After a successful apply, instead of running `tsc --noEmit` on the full project, a minimal `tsconfig.json` is generated in the temp dir including only the scope files. `tsc --noEmit` is run against that.
- Expected reduction: full-project tsc (~15s) → scoped tsc (~1s) for typical deeply-nested files.

## Capabilities

### New Capabilities

- `scoped-compilation-check`: Logic in the test runner that builds the reverse import map from the ts-morph project and generates a per-candidate scoped tsconfig for post-apply verification.

### Modified Capabilities

(none — all changes are inside the test script)

## Impact

- `scripts/test-real-codebase/run.ts`: adds reverse import map construction, per-candidate scope computation, scoped tsconfig generation
- No changes to CLI, core modules, or refactoring definitions
- No new dependencies
