## 1. run.ts: --stop-on-first-failure flag

- [x] 1.1 Add `--stop-on-first-failure` arg parsing to `run.ts` (boolean flag, default false)
- [x] 1.2 Define `FailureReport` interface matching the spec (refactoring, repo, candidate, params, sourceBefore, diff, error, errorType, candidatesTestedSoFar)
- [x] 1.3 In the candidate loop, when `--stop-on-first-failure` is active and a syntax or semantic failure occurs: build the FailureReport JSON, write to stdout, and exit with code 1
- [x] 1.4 On clean exit with `--stop-on-first-failure`: output `{ success: true, candidatesTested: N }` to stdout and exit 0
- [x] 1.5 When `--stop-on-first-failure` is set and `--max-applies` is not explicitly provided, default `--max-applies` to 500
- [ ] 1.6 Test: run `run.ts --refactoring <name> --repo zod --stop-on-first-failure --max-applies 5` and verify JSON output on both success and failure paths

## 2. run.ts: candidate tried-set persistence

- [x] 2.1 Add `--tried-set-file <path>` arg parsing to `run.ts`
- [x] 2.2 On startup, load the NDJSON file into a `Set<string>` (handle missing/empty file gracefully)
- [x] 2.3 Before shuffling, filter out candidates whose `"repo::file::target"` key is in the tried-set
- [x] 2.4 After each candidate is processed (skip, pass, or fail), append its key as a line to the tried-set file
- [x] 2.5 When all candidates for a refactoring on a repo are in the tried-set, log "no untried candidates remain" and exit 0
- [ ] 2.6 Test: run twice with the same tried-set file and verify no candidates are re-drawn

## 3. run.ts: expand repository list

- [ ] 3.1 Research and select 10+ candidate repos (vitest/jest, scoped test support, pinned tag, moderate size)
- [ ] 3.2 For each candidate: clone, install, verify `tsc --noEmit` passes, verify test suite passes, verify scoped test command works
- [ ] 3.3 Add verified repos to the `REPOS` array in `run.ts` with testMode "compile-and-test"
- [ ] 3.4 Run `run.ts --dry-run` to confirm all new repos enumerate candidates successfully

## 4. Orchestrator: worker pool and worktree lifecycle

- [x] 4.1 Create `scripts/fuzz-fix-loop/orchestrator.ts` with arg parsing (--refactoring, --repo, --workers, defaults)
- [x] 4.2 Implement `loadRefactorings()`: get the list of refactorings to assign (from `run.ts --dry-run` or CLI list)
- [x] 4.3 Implement worktree creation: `git worktree add tmp/worktrees/<name> -b fuzz-fix/<name>` from current main
- [x] 4.4 Implement worker pool: maintain up to N active workers, assign next refactoring when a slot opens
- [x] 4.5 Implement worktree cleanup: remove worktree and branch after worker completes all repos
- [ ] 4.6 Test: run orchestrator with `--workers 1 --refactoring extract-variable --repo zod` and verify worktree is created, run.ts is invoked, and worktree is cleaned up

## 5. Orchestrator: worker execution loop

- [x] 5.1 Implement the per-worker loop: for each repo, spawn `npx tsx run.ts --refactoring <name> --repo <repo> --stop-on-first-failure --tried-set-file <path> --json` as a child process in the worktree directory
- [x] 5.2 Parse child process stdout to detect exit 0 (move to next repo) vs exit 1 (FailureReport JSON)
- [x] 5.3 On failure: pass FailureReport to the fix agent flow (section 6), then re-invoke run.ts for the same repo after merge-rebase completes
- [x] 5.4 On clean exit for all repos: mark worker as complete, write findings JSON to `tmp/fuzz-state/<refactoring>.findings.json`
- [x] 5.5 Forward worker stderr to the orchestrator for dashboard updates

## 6. Fix agent prompt and invocation

- [x] 6.1 Create `scripts/fuzz-fix-loop/fix-agent-prompt.md` with the prompt template: failure JSON placeholder, fixture conventions, step-by-step instructions (create fixture → verify fails → fix code → verify passes → commit)
- [x] 6.2 Implement `spawnFixAgent(failureReport, worktreeDir)`: write temp prompt file with interpolated failure details, invoke `claude --print --dangerously-skip-permissions --output-format json`, parse JSON result
- [x] 6.3 Handle agent success: extract commitHash, fixturePath, filesChanged, fixSummary; append to worker findings
- [x] 6.4 Handle agent stuck: extract stuckReport; append unresolved finding; continue worker to next candidate
- [ ] 6.5 Test: craft a synthetic FailureReport JSON, run the fix agent in a test worktree, verify it creates a fixture and commits

## 7. Merge-rebase coordination

- [x] 7.1 Implement the global merge lock: when a worker signals a fix commit, prevent other workers from starting new run.ts or fix agent invocations
- [x] 7.2 Implement merge: `git -C <main-repo> merge fuzz-fix/<name> --ff-only` from the main repo working directory
- [x] 7.3 Implement rebase: for each other active worktree, `git -C <worktree> rebase main`
- [x] 7.4 On rebase conflict: create a conflict-resolution prompt (conflict markers, merged diff, pre-rebase diff), spawn headless Claude agent in the worktree
- [x] 7.5 On conflict resolution success: `git rebase --continue`, resume worker
- [x] 7.6 On conflict resolution failure (2 attempts): `git rebase --abort`, discard worker's commit, worker continues (failure will be re-discovered)
- [x] 7.7 Release the merge lock and resume all workers
- [ ] 7.8 Test: simulate two worktrees with overlapping shared-code changes and verify the merge-rebase-conflict flow

## 8. Live dashboard

- [x] 8.1 Implement dashboard state: per-worker (refactoring, current repo, candidates tested, status), totals (pairs completed, errors found/fixed/unresolved)
- [x] 8.2 Implement dashboard rendering: ANSI escape codes to overwrite previous output on stderr — progress bar, per-worker rows, summary row
- [x] 8.3 Parse worker stderr lines to update dashboard state (match patterns like "Testing:", target counts, repo starts)
- [x] 8.4 Implement progress calculation: completed pairs / (total refactorings * total repos) * 100
- [x] 8.5 Add 1-second debounce to prevent flicker on rapid stderr output
- [x] 8.6 Print final summary on completion (per-refactoring stats table, total errors, total candidates)

## 9. Findings report

- [x] 9.1 Define `Finding` interface (refactoring, repo, repoUrl, repoRef, errorType, candidate, exampleCode, error, diff, resolution, fixturePath, commitHash, fixSummary, stuckReport)
- [x] 9.2 After all workers complete: read `tmp/fuzz-state/*.findings.json`, merge into a single list
- [x] 9.3 Generate the markdown report: summary header (totals), then entries grouped by refactoring and ordered by repo
- [x] 9.4 Each entry includes: error type, example code block, GitHub permalink (`https://github.com/<owner>/<repo>/blob/<ref>/<file>#L<line>`), error description, fix summary + commit hash (or "UNRESOLVED" + stuck report), fixture path
- [x] 9.5 Write report to `tmp/fuzz-fix-loop/findings-report.md` and print to stdout
- [x] 9.6 Handle empty case: "No problems found" with total candidates and repos tested

## 10. End-to-end integration

- [ ] 10.1 Run the full orchestrator with `--workers 1 --refactoring extract-variable --repo zod --max-applies 20` as a smoke test
- [ ] 10.2 Verify: worktree created, run.ts invoked with correct flags, tried-set file written, dashboard renders, worktree cleaned up
- [ ] 10.3 Run with `--workers 3` across 3 refactorings on a single repo to verify concurrent worker pool and merge-rebase coordination
- [ ] 10.4 Verify findings report is generated with correct format
- [ ] 10.5 Add `tmp/fuzz-state/` and `tmp/worktrees/` to `.gitignore`
