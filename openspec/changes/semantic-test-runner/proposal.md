## Why

The real-codebase test runner currently only checks whether refactored code compiles (`tsc --noEmit`). This catches type errors but misses silent semantic changes — refactorings that produce valid TypeScript but alter runtime behavior. Projects with fast, high-coverage test suites can serve as an oracle: if their tests pass before a refactoring but fail after, the refactoring broke semantics.

## What Changes

- Add per-repo `testMode` configuration (`compile-only` | `compile-and-test`) to `RepoConfig`
- Add `testCmd`, `scopedTestCmd`, `relatedTestsFlag`, `testTimeout`, and `projectSubdir` fields for repos that opt into semantic testing
- After a successful `tsc` check, run scoped tests (only tests related to changed files) for repos configured with `compile-and-test`
- Add a baseline test verification step that confirms a repo's tests pass before applying refactorings
- Extend `CandidateResult` and `RefactoringStats` to track a new failure category: compiles but tests fail (semantic errors)
- Add `--skip-tests` flag to bypass semantic testing even for repos that have it configured
- Add `--seed` flag for reproducible but varied candidate shuffling
- Expand from 5 repos to 18 (12 compile-and-test, 6 compile-only)
- Add monorepo support via `projectSubdir` (e.g., remeda's `packages/remeda/`)
- Output fixture-ready blocks for each semantic failure: source context, diff, params, and suggested fixture path
- Detect and handle vitest cache corruption from AST-truncated files

## Capabilities

### New Capabilities
- `semantic-test-verification`: Running scoped project tests after successful compilation to detect semantics-breaking refactorings

### Modified Capabilities
- `real-codebase-test-runner`: The runner gains per-repo test configuration, a new verification step after compilation, new result/reporting categories for semantic failures, monorepo support, stale cache detection, and seed-based candidate shuffling

## Impact

- **Code**: `scripts/test-real-codebase/run.ts` — `RepoConfig` interface, `applyAndCheck` function, stats/reporting, candidate shuffling
- **Repos**: 12 repos with fast test suites get semantic verification; 6 repos stay compile-only
- **Runtime**: Semantic checks add ~1-3s per candidate (scoped test run) vs. ~100ms for compile-only
- **Refactoring fixes**: 15+ refactorings received precondition or logic fixes from bugs discovered by the semantic test layer
