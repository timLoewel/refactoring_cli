# Tasks

## 1. Rename --max-candidates to --max-applies

- [x] 1.1 Rename `--max-candidates` CLI flag to `--max-applies` and update `maxCandidates` variable to `maxApplies` throughout `run.ts`
- [x] 1.2 Update log messages that reference "valid targets" or "candidates" to say "applies"

## 2. Extend RepoConfig and add new repos

- [x] 2.1 Add `testMode`, `testCmd`, `relatedTestsFlag`, `testTimeout`, and `projectSubdir` fields to `RepoConfig` interface
- [x] 2.2 Update existing repos (typeorm → compile-only, zod/date-fns/inversify/ts-pattern → compile-and-test with their test commands)
- [x] 2.3 Add compile-and-test repos: superstruct, neverthrow, remeda, immer, true-myth, purify-ts, class-validator, class-transformer
- [x] 2.4 Add compile-only repos: rxjs, fp-ts, io-ts, immutable-js, mobx
- [x] 2.5 Add `--skip-tests` CLI flag parsing (forces all repos to compile-only)

## 3. Baseline test verification

- [x] 3.1 Add `checkBaselineTests(repo, cacheDir)` that runs the full `testCmd` once on the unmodified repo
- [x] 3.2 On failure, log a warning and downgrade the repo to compile-only for this run (do not abort)
- [x] 3.3 Wire baseline test check into `runRepo` after `checkBaseline` for repos with `testMode: "compile-and-test"`

## 4. Scoped test execution in applyAndCheck

- [x] 4.1 After tsc passes for a compile-and-test repo, construct and run `{testCmd} {relatedTestsFlag} {changedFiles...}` with a timeout
- [x] 4.2 Kill the test process if it exceeds `testTimeout` (default 30s) and record as test failure
- [x] 4.3 Handle "no related tests found" (zero tests matched) as a pass
- [x] 4.4 Add `testsPassed`, `testError`, and `testMs` fields to `CandidateResult`

## 5. Monorepo support

- [x] 5.1 When `projectSubdir` is set, use `{cacheDir}/{projectSubdir}` as the effective root for tsconfig resolution, candidate enumeration, and test execution
- [x] 5.2 Verify with `--dry-run` that remeda (`packages/remeda`) clones, installs, and compiles

## 6. Reporting and output for fixture creation

- [x] 6.1 Add `semanticErrors` count to `RefactoringStats` alongside existing `failed` (type errors)
- [x] 6.2 Update summary table to show separate TypeErr and SemanticErr columns
- [x] 6.3 For semantic failures, output a fixture-ready block containing: refactoring name, params used, the source code before the refactoring (the function/class/block around the target), the diff, and the test error message
- [x] 6.4 Deduplicate semantic failures by root cause pattern (normalize error messages like skip reasons) and output only the first occurrence per unique cause, with a count
- [x] 6.5 At the end of the run, print a "fixture creation summary" section that lists each unique semantic failure with: the suggested fixture path (`src/refactorings/<name>/fixtures/<cause>.fixture.ts`), the minimal source to paste into the fixture, and the params block (`export const params = { ... }`)

## 7. Dry-run and validation

- [x] 7.1 Extend `--dry-run` to report which repos will use compile-and-test vs. compile-only
- [x] 7.2 Run `--dry-run` against all 18 repos to confirm clone, install, and baseline compilation
- [x] 7.3 Run a small test (`--max-applies 5`) against each compile-and-test repo to confirm scoped test execution works

## 8. Run tests and fix — interleaved per refactoring×repo

Work through one refactoring at a time, across repos in order. For each pair: run, triage, fix, create fixtures, then move to the next repo. Fixes made on earlier repos carry forward to later ones.

Invoke per pair: `tsx scripts/test-real-codebase/run.ts --refactoring <name> --repo <name> --max-applies 100`

- [x] 8.1 For each refactoring (outer loop), for each compile-and-test repo (inner loop): run the refactoring, triage failures, then for each confirmed bug either fix the transformation or add a missing precondition that rejects the unsafe case. Create a `.fixture.ts` for each: semantic bugs get a fixture that asserts output mismatch, missing preconditions get a fixture that asserts the refactoring is rejected (precondition fails). Verify fixtures pass in vitest, then advance to the next repo.
- [x] 8.2 After all compile-and-test repos are done for a refactoring, run it against each compile-only repo (inner loop): triage type errors, then for each confirmed bug either fix the transformation or add a missing precondition. Create type-error or precondition-rejection fixtures accordingly, fix and advance.

## 9. README marketing section and release

- [x] 9.1 Write a short, factual marketing section at the top of README.md (after the title/tagline, before Installation). Describe the real-world testing approach: how many repos, which ones, what the test runner validates (compile + semantic correctness). No hyperbole — just what's tested and why it matters.
- [x] 9.2 Bump version to 0.3.0 in package.json and create a new npm release
