## ADDED Requirements

### Requirement: Worker pool management
The orchestrator SHALL manage a pool of up to 3 concurrent workers. Each worker is assigned exactly one refactoring and runs in its own git worktree. No two workers SHALL be assigned the same refactoring.

#### Scenario: Pool size limit
- **WHEN** 3 workers are active and more refactorings remain unassigned
- **THEN** the orchestrator waits for a worker to complete before starting a new one

#### Scenario: One refactoring per worker
- **WHEN** a worker is assigned refactoring "extract-variable"
- **THEN** no other worker is assigned "extract-variable"

#### Scenario: All refactorings assigned
- **WHEN** every refactoring has been assigned to a worker (current or completed)
- **THEN** no new workers are started; the orchestrator waits for active workers to finish

### Requirement: Worktree lifecycle
Each worker SHALL operate in a dedicated git worktree created from main. The worktree branch is named `fuzz-fix/<refactoring-name>`. Worktrees are cleaned up after their worker completes all repos.

#### Scenario: Worktree creation
- **WHEN** a worker starts for refactoring "inline-variable"
- **THEN** a worktree is created at `tmp/worktrees/inline-variable` on branch `fuzz-fix/inline-variable` based on current main

#### Scenario: Worktree cleanup
- **WHEN** a worker completes all repos for its refactoring with no pending changes
- **THEN** the worktree directory and branch are removed

#### Scenario: Worktree cleanup with unmerged changes
- **WHEN** a worker completes but has commits not yet merged to main
- **THEN** the orchestrator merges remaining commits before cleanup

### Requirement: Worker execution loop
Each worker SHALL iterate over all repos sequentially. For each repo, it invokes `run.ts` with `--refactoring <name> --max-applies 500 --stop-on-first-failure --tried-set-file <path>`. On failure exit, the worker spawns a fix agent. On clean exit (no failures), it moves to the next repo.

#### Scenario: Clean run on a repo
- **WHEN** `run.ts` exits 0 (all candidates handled, no failures)
- **THEN** the worker moves to the next repo

#### Scenario: Failure found
- **WHEN** `run.ts` exits non-zero with JSON failure details on stdout
- **THEN** the worker spawns a fix agent with the failure details

#### Scenario: Resume after fix
- **WHEN** the fix agent commits and the merge-rebase cycle completes
- **THEN** the worker re-invokes `run.ts` for the same refactoring and repo (tried-set file ensures no re-draws)

#### Scenario: All repos completed
- **WHEN** the worker has processed all repos for its refactoring
- **THEN** the worker reports completion to the orchestrator

### Requirement: Merge-rebase coordination
After each fix commit, the orchestrator SHALL merge the worktree branch into main and rebase all other active worktrees onto the updated main. All other workers MUST be paused during the merge-rebase cycle.

#### Scenario: Successful merge
- **WHEN** a fix commit exists on branch `fuzz-fix/extract-variable`
- **THEN** the orchestrator merges that branch into main (fast-forward or merge commit)

#### Scenario: Rebase other worktrees
- **WHEN** main has been updated with a merged fix
- **THEN** all other active worktree branches are rebased onto the new main

#### Scenario: Rebase conflict
- **WHEN** rebasing a worktree branch onto main produces a conflict
- **THEN** the orchestrator spawns a conflict-resolution agent in the conflicting worktree with the conflict markers, the merged commit diff, and the pre-rebase commit diff

#### Scenario: Rebase conflict resolved by agent
- **WHEN** the conflict-resolution agent resolves all conflicts and quality checks pass
- **THEN** the rebase completes (`git rebase --continue`) and the worker resumes normally

#### Scenario: Rebase conflict unresolvable
- **WHEN** the conflict-resolution agent fails after 2 attempts
- **THEN** the orchestrator aborts the rebase (`git rebase --abort`), discards the worker's commit, and the worker continues (the underlying failure will be re-discovered on the next `run.ts` invocation)

#### Scenario: Workers paused during merge-rebase
- **WHEN** a merge-rebase cycle is in progress
- **THEN** no worker starts a new `run.ts` invocation or fix agent until the cycle completes

### Requirement: Live dashboard
The orchestrator SHALL print a continuously-updated dashboard to stderr showing the state of all workers and overall progress.

#### Scenario: Dashboard content
- **WHEN** the orchestrator is running
- **THEN** the dashboard shows: (1) overall progress bar 0..100%, (2) total refactorings checked/remaining, (3) total errors found and fixed, (4) per-worker: refactoring name, current repo, candidates tested/500, status (running/fixing/waiting)

#### Scenario: Dashboard update frequency
- **WHEN** a worker completes a repo, finds a failure, or finishes a fix
- **THEN** the dashboard is refreshed

#### Scenario: Final summary
- **WHEN** all workers have completed
- **THEN** the orchestrator prints a final summary: per-refactoring stats, total errors found/fixed, total candidates tested

### Requirement: Progress calculation
Overall progress SHALL be calculated as: (completed refactoring-repo pairs) / (total refactorings * total repos) * 100. A refactoring-repo pair is "completed" when all 500 candidates (or all available) have been tested without failure, or all failures have been fixed and retesting passed.

#### Scenario: Progress with 9 refactorings and 28 repos
- **WHEN** 3 refactoring-repo pairs are fully tested
- **THEN** progress is 3 / (9 * 28) * 100 = 1.2%

#### Scenario: Partial progress during a run
- **WHEN** a worker is at candidate 250/500 on a repo
- **THEN** that repo counts as 0 completed (only fully-tested pairs count)

### Requirement: Invocation
The orchestrator SHALL be invocable as a single command with optional overrides.

#### Scenario: Default invocation
- **WHEN** `npx tsx scripts/fuzz-fix-loop/orchestrator.ts` is run with no arguments
- **THEN** all refactorings are tested against all repos with max 3 concurrent workers and 500 candidates per refactoring-repo pair

#### Scenario: Refactoring filter
- **WHEN** `--refactoring extract-variable,inline-variable` is provided
- **THEN** only those refactorings are assigned to workers

#### Scenario: Repo filter
- **WHEN** `--repo zod,date-fns` is provided
- **THEN** workers only test against those repos

#### Scenario: Concurrency override
- **WHEN** `--workers 1` is provided
- **THEN** only 1 worker runs at a time

### Requirement: Final findings report
When all workers have completed, the orchestrator SHALL write a structured findings report listing every problem found during the run. The report SHALL be written to `tmp/fuzz-fix-loop/findings-report.md` and also printed to stdout.

#### Scenario: Report entry per finding
- **WHEN** a fix agent successfully fixed a problem
- **THEN** the report contains an entry with: (1) refactoring name, (2) error type (syntax/semantic), (3) minimal example code that triggered the failure, (4) a link to the concrete source in the real-world repo (GitHub permalink: `https://github.com/<owner>/<repo>/blob/<ref>/<file>#L<line>`), (5) what went wrong (compiler error or test failure description), (6) how it was solved (summary of the fix + commit hash)

#### Scenario: Report entry for unfixed problem
- **WHEN** a fix agent was stuck and could not resolve a problem
- **THEN** the report contains an entry marked as "UNRESOLVED" with the same fields (1)-(5) plus the stuck report from the agent

#### Scenario: Report ordering
- **WHEN** the report is generated
- **THEN** entries are grouped by refactoring name, then ordered by repo name within each group

#### Scenario: Report summary header
- **WHEN** the report is generated
- **THEN** it begins with a summary: total problems found, total fixed, total unresolved, total candidates tested, total repos tested, total refactorings tested

#### Scenario: Empty report
- **WHEN** no problems were found across all workers
- **THEN** the report states "No problems found" with the total candidates and repos tested

#### Scenario: Report includes fixture path
- **WHEN** a problem was fixed with a new fixture
- **THEN** the report entry includes the path to the created fixture file
