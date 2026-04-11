## Context

The real-codebase test runner (`scripts/test-real-codebase/run.ts`, 1276 lines) already handles: repo cloning/caching, baseline verification, candidate enumeration, daemon-based apply+rollback, in-process tsc checking, scoped test execution, and reporting. It runs sequentially: for each repo → for each refactoring → for each candidate. It supports `--refactoring`, `--repo`, `--max-applies`, `--seed`, and `--json` flags.

The existing `scripts/openspec-loop/loop.sh` demonstrates the pattern of running headless Claude (`claude --print`) in a loop with learnings accumulation. This is the model for the fix agent.

There are currently 18 repos (12 compile-and-test, 6 compile-only) and approximately 9 TypeScript refactorings. At 500 candidates per refactoring-repo pair, the total search space is ~9 * 28 * 500 = 126,000 candidate tests.

## Goals / Non-Goals

**Goals:**
- Autonomously find and fix every syntax/semantic failure across all refactorings and repos
- Parallelize by refactoring (max 3 concurrent) with clean merge-back to main
- Produce a comprehensive findings report with example code, links, and fix descriptions
- Be resumable: a stopped run can be restarted without repeating already-tested candidates
- Provide live visibility into progress from the terminal that launched the script

**Non-Goals:**
- Rewriting `run.ts` from scratch — we modify it in-place, adding flags
- Handling merge conflicts automatically — conflicting worktrees are stopped, not auto-resolved
- Supporting non-TypeScript refactorings
- Capping agent cost or duration — the user manages this externally

## Decisions

### D1: Orchestrator is TypeScript, not bash

The orchestrator (`scripts/fuzz-fix-loop/orchestrator.ts`) is TypeScript run via `npx tsx`. It manages child processes (workers), git operations, and dashboard rendering.

**Why not bash:** The orchestrator needs to parse JSON from `run.ts` and the fix agent, manage a concurrent worker pool with event-driven scheduling, and maintain in-memory state for the dashboard. Bash can do this but it's brittle and hard to debug. TypeScript matches the rest of the codebase and has proper async/process management.

**Alternative considered:** A simple bash script that runs workers sequentially. Rejected because sequential execution would take ~3x longer with no parallelism benefit.

### D2: Workers are child processes, not threads

Each worker is a separate `npx tsx run.ts` child process. The orchestrator spawns up to 3, each in its own worktree directory. Workers communicate with the orchestrator only through:
- Exit code (0 = clean, 1 = failure found)
- Stdout (JSON: either FailureReport or success summary)
- Stderr (progress logs, forwarded to orchestrator for dashboard)

**Why child processes:** The daemon (`startDaemon`) binds to a project directory and holds a ts-morph Project in memory. Running multiple refactorings against the same repo within one process would share the daemon, creating contention during rollback/refresh cycles. Separate processes get separate daemons.

### D3: Tried-set is a newline-delimited JSON file, not a full JSON object

The tried-set file format is NDJSON (one `"repo::file::target"` string per line). On load, lines are read into a `Set<string>`. After each candidate, one line is appended.

**Why NDJSON over JSON:** Appending a line is atomic and crash-safe (no need to rewrite the whole file). If the process dies mid-run, all candidates processed up to that point are recorded. A JSON object would require read-modify-write on every candidate, which is both slow and corruption-prone.

**File location:** `tmp/fuzz-state/<refactoring-name>.tried.ndjson`. One file per refactoring (contains entries for all repos, keyed by `repo::file::target`).

### D4: Merge-rebase uses a global lock

When a worker signals a fix commit, the orchestrator:
1. Pauses all workers (sends SIGSTOP or simply doesn't spawn new `run.ts` invocations — since workers only run one `run.ts` at a time, waiting for exit is sufficient)
2. Merges the worktree branch into main: `git checkout main && git merge fuzz-fix/<name> --ff-only`
3. Rebases all other active worktree branches: `cd <worktree> && git rebase main`
4. If rebase fails: spawn a conflict-resolution agent in the worktree (see below)
5. Resumes workers

**Why ff-only merge:** The merge step is always conflict-free. The fixing worker's branch was created from (or last rebased onto) current main, adds exactly 1 commit, and all other workers are paused so main doesn't advance. Fast-forward just moves main's pointer.

**Rebase conflict resolution:** Rebase is the only step that can conflict — when worker B has an in-progress fix commit that touches the same shared file as the just-merged commit from A. On conflict, the orchestrator spawns a headless Claude agent in the conflicting worktree with:
- The conflict markers (from `git diff`)
- The already-merged commit diff (what A changed)
- The pre-rebase commit diff (what B intended)
- Instructions: resolve conflicts, run quality checks, `git rebase --continue`

If the agent resolves successfully, the worker continues. If the agent fails after 2 attempts, the orchestrator aborts the rebase (`git rebase --abort`), discards B's commit, and re-queues B's current fix (the failure that prompted B's commit is re-discovered on the next `run.ts` invocation since the tried-set still marks the candidate as tried but the fix was lost). This is safe because the underlying failure will be found again.

**Why not cherry-pick:** Cherry-pick would duplicate commits. Fast-forward merge keeps a linear history.

### D5: Fix agent receives a self-contained prompt file

The orchestrator writes a temporary prompt file containing:
1. The FailureReport JSON (from `run.ts`)
2. The project's fixture conventions (extracted from `auto-fixture-tests` spec or hardcoded)
3. Instructions: "Create a minimal fixture, verify it fails, fix the code, verify it passes, commit"
4. The repo URL and ref (for GitHub permalink construction in the findings report)

This file is piped to `claude --print --dangerously-skip-permissions --output-format json`. The agent's JSON output is parsed for `success`, `commitHash`, `fixturePath`, `filesChanged`, `stuckReport`.

**Why a prompt file vs command-line args:** The failure report can be large (source context, diff, error output). Passing it as a file avoids shell escaping issues.

**Working directory for the agent:** The agent runs in the worktree directory, not the main repo. This means it can read/write refactoring source files, run tests, and commit — all isolated from other workers.

### D6: Dashboard uses ANSI escape codes on stderr

The dashboard overwrites the previous output using `\x1b[<N>A` (cursor up N lines) + `\r` (carriage return). It renders:
- A progress bar: `[████████░░░░░░░░░░░░] 42% (106/252 pairs)`
- Per-worker rows: `W1: extract-variable | zod | 312/500 candidates | running`
- Summary row: `Found: 3 errors (2 fixed, 1 unresolved)`

**Why stderr:** Stdout is reserved for the final findings report (machine-parseable). The dashboard is a human-readable status display.

**Update trigger:** The orchestrator polls worker stderr (which `run.ts` writes progress to) and updates the dashboard on each meaningful line (target found, repo started, etc). A 1-second debounce prevents flicker.

### D7: Repo list expansion — selection criteria

10 new compile-and-test repos are added. Selection criteria:
- Must have a working vitest or jest test suite
- Must support scoped test execution (`vitest related --run` or `jest --findRelatedTests`)
- Must compile with `tsc --noEmit` out of the box (or with minor config)
- Must have a pinned release tag
- Prefer libraries over applications (stable APIs, more class/function targets)
- Prefer moderate size (500-5000 source files) — too small has few candidates, too large is slow

Candidates to evaluate (final list determined during implementation by verifying baseline compile + tests):
- effect-ts (Effect), type-fest, arktype, valibot, drizzle-orm, trpc, kysely, prisma-client, tsyringe, typedi

### D8: Worker-to-orchestrator finding reporting

Each worker maintains a `findings: Finding[]` array in memory. When a fix agent completes (success or stuck), the worker appends to this array. When the worker finishes all repos, it writes its findings as JSON to `tmp/fuzz-state/<refactoring-name>.findings.json`.

The orchestrator reads all findings files at the end and assembles the final report. This avoids workers needing to coordinate writes to a shared file.

**Finding structure:**
```typescript
interface Finding {
  refactoring: string;
  repo: string;
  repoUrl: string;
  repoRef: string;
  errorType: "syntax" | "semantic";
  candidate: { file: string; target: string; line: number };
  exampleCode: string;        // ~20 lines of source around the target
  error: string;              // compiler or test error
  diff: string;               // what the refactoring produced
  resolution: "fixed" | "unresolved";
  fixturePath?: string;       // path to created fixture
  commitHash?: string;        // fix commit
  fixSummary?: string;        // what the agent changed
  stuckReport?: string;       // why the agent couldn't fix it
}
```

### D9: run.ts modifications are additive

All changes to `run.ts` are additive — no existing behavior is removed or changed:
- `--stop-on-first-failure`: new flag, only active when explicitly passed
- `--tried-set-file`: new flag, only active when explicitly passed
- `--max-applies` default changes from `undefined` to `500` (only when `--stop-on-first-failure` is also set, to match the fuzz loop expectation)
- New repos are appended to the `REPOS` array
- The existing standalone usage (no new flags) works identically

## Risks / Trade-offs

**[Shared code fix causes rebase conflict]** → If a fix agent modifies `src/core/refactoring-builder.ts` or similar, other worktrees may conflict on rebase. Mitigation: the orchestrator spawns a conflict-resolution agent to resolve it. If unresolvable after 2 attempts, the conflicting commit is discarded and the failure is re-discovered on the next `run.ts` pass (safe because the tried-set tracks candidates, not fixes).

**[Fix agent produces incorrect fix]** → The agent might "fix" a test by weakening it rather than fixing the actual issue. Mitigation: the agent must run the full test suite (`npm test`), not just the new fixture. Code review of the findings report + commits catches misguided fixes.

**[Daemon port conflicts across worktrees]** → Each worktree spawns its own daemon. If daemons use a fixed port, they'll conflict. Mitigation: the daemon already uses the project directory to derive its socket path (Unix domain socket), so different worktrees get different sockets.

**[Tried-set grows large for big repos]** → A repo with 50,000 candidates and 500 applies would accumulate ~50,000 entries in the NDJSON file. At ~80 bytes per line, that's ~4MB. Loading into a Set is fast. Not a practical concern.

**[Agent cost]** → Each fix agent invocation costs API tokens. With sparse failures expected, this should be a small number of invocations (single digits per refactoring). No budget cap is implemented — the user monitors cost externally.

**[Repo download time]** → 28 repos need cloning + npm install on first run. The existing caching in `run.ts` handles this. Worktrees share the main repo's `tmp/real-codebase/` cache, so repos are only cloned once regardless of how many workers need them.

## Open Questions

- **Exact list of 10 new repos:** The candidates in D7 need to be verified (baseline compile + test). The final list is determined during implementation.
- **Agent token limit:** Should the fix agent have a `--max-tokens` cap to prevent runaway sessions? Currently unspecified.
- **Partial run restart:** If the orchestrator is killed mid-run, should it detect in-progress worktrees and resume them? Current design: tried-set files enable resume, but worktrees would need to be recreated. The user would re-run and only untried candidates would be tested.
