## Why

The real-codebase test runner (`scripts/test-real-codebase/run.ts`) finds syntax and semantic failures but cannot fix them. Each failure requires manual triage: reading the error, creating a fixture, fixing the refactoring code, and re-running. With 9+ refactorings, 18+ repos, and 500 candidates per combination, the search space is large but failures are expected to be sparse. An autonomous loop that finds failures and fixes them in-place — stopping only when stuck — turns a multi-day manual effort into an overnight batch run.

## What Changes

- **Rework `scripts/test-real-codebase/run.ts`** into the deterministic inner loop. This is the sole interface for testing refactorings against real-world repos. Changes:
  - Add `--stop-on-first-failure` mode: on the first syntax or semantic failure, output structured failure details (source, diff, params, error) as JSON and exit. Precondition rejections and successful applies are "handled" and do not trigger a stop.
  - Add candidate tried-set tracking: persist which candidates have been considered per refactoring per repo, so that after a fix cycle the runner resumes without re-drawing them. Already-tried candidates are removed from the pool before shuffling.
  - Add 10 new compile-and-test repos with healthy test suites.
  - Hardcode `--max-applies 500` as the default for the fuzz loop (overridable).
- **New orchestrator script** that manages a pool of up to 3 concurrent workers, each assigned one refactoring in its own git worktree. The orchestrator invokes `run.ts` per worker and prints a live dashboard (per-refactoring progress, current repo, error counts, overall 0..100% bar).
- **Fix agent prompt** — a headless Claude session that receives failure details, creates a minimal failing fixture/test, fixes the refactoring code, runs quality checks, and commits.
- **Merge-rebase workflow** — after each fix commit, the orchestrator merges the worktree branch into main and rebases all other active worktrees before they continue.

## Capabilities

### New Capabilities
- `fuzz-fix-orchestrator`: Top-level script managing worker pool (max 3), refactoring assignment, live dashboard, merge-rebase coordination, and progress reporting
- `fix-agent-prompt`: Headless Claude agent prompt and workflow for creating fixtures and fixing refactoring code from structured failure reports

### Modified Capabilities
- `real-codebase-test-runner`: Add `--stop-on-first-failure` flag, candidate tried-set persistence/I/O, and 10 new compile-and-test repos. This is the sole deterministic interface for testing against real repos — the orchestrator calls it, it is not used standalone anymore.

## Impact

- **New files:** orchestrator script (`scripts/fuzz-fix-loop/`), fix agent prompt
- **Modified files:** `scripts/test-real-codebase/run.ts` (stop-on-first-failure, tried-set I/O, new repos)
- **State files:** tried-set JSONs in `tmp/fuzz-state/` (gitignored, ephemeral)
- **Git workflow:** worktree creation/cleanup, automated merges to main, rebases across active worktrees
- **Dependencies:** no new npm dependencies (uses existing `claude` CLI, `git`, `tsx`)
- **Risk:** automated merges to main require clean conflict-free commits; shared-code fixes may cause rebase conflicts across worktrees (orchestrator must detect and handle this)
