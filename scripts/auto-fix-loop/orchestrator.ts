import { spawn, spawnSync } from "child_process";
import {
  appendFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
  symlinkSync,
} from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const RUN_TS = join(ROOT, "scripts/test-real-codebase/run.ts");
const STATE_DIR = join(ROOT, "tmp/auto-fix-state");
const WORKTREES_DIR = join(ROOT, "tmp/worktrees");
const LOGS_DIR = join(ROOT, "tmp/auto-fix-logs");

// --- Interfaces ---

interface FailureReport {
  refactoring: string;
  repo: string;
  candidate: { file: string; target: string };
  params: Record<string, unknown>;
  sourceBefore: string;
  diff: string;
  error: string;
  errorType: "syntax" | "semantic";
  candidatesTestedSoFar: number;
}

interface Finding {
  refactoring: string;
  repo: string;
  repoUrl: string;
  repoRef: string;
  errorType: "syntax" | "semantic";
  candidate: { file: string; target: string; line: number };
  exampleCode: string;
  error: string;
  diff: string;
  resolution: "fixed" | "unresolved";
  fixturePath?: string;
  commitHash?: string;
  fixSummary?: string;
  stuckReport?: string;
}

interface FixAgentResult {
  success: boolean;
  fixturePath?: string;
  filesChanged?: string[];
  commitHash?: string;
  fixSummary?: string;
  stuckReport?: string;
}

// One row per refactoring. Persistent for the whole run — workers come and go,
// but the worktree, branch, tried-set, log, and findings outlive any one worker.
interface RefactoringState {
  refactoring: string;
  worktreePath: string;
  branchName: string;
  triedSetFile: string;
  logFile: string;
  candidatesTested: number;
  findings: Finding[];
}

// One row per parallel worker slot. Workers don't own a refactoring; they pick
// (refactoring, repo) pairs from the scheduler. Fields update as the slot moves
// between pairs.
interface WorkerSlot {
  workerId: number;
  refactoring: string;
  repo: string;
  status: "idle" | "running" | "fixing" | "merging" | "waiting" | "done";
}

interface DashboardState {
  workers: WorkerSlot[];
  totalRefactorings: number;
  totalRepos: number;
  totalPairs: number;
  completedPairs: number;
  errorsFound: number;
  errorsFixed: number;
  errorsUnresolved: number;
}

// --- Arg parsing ---

const scriptArgs = process.argv.slice(2);

const refactoringFilter = ((): string[] | undefined => {
  const idx = scriptArgs.indexOf("--refactoring");
  if (idx < 0) return undefined;
  return scriptArgs[idx + 1]?.split(",");
})();

const repoFilter = ((): string[] | undefined => {
  const idx = scriptArgs.indexOf("--repo");
  if (idx < 0) return undefined;
  return scriptArgs[idx + 1]?.split(",");
})();

const maxWorkers = ((): number => {
  const idx = scriptArgs.indexOf("--workers");
  return idx >= 0 ? parseInt(scriptArgs[idx + 1] ?? "3", 10) : 3;
})();

const maxApplies = ((): number => {
  const idx = scriptArgs.indexOf("--max-applies");
  return idx >= 0 ? parseInt(scriptArgs[idx + 1] ?? "500", 10) : 500;
})();

// --- Repo list (mirrors run.ts — used for progress tracking) ---

interface RepoInfo {
  name: string;
  url: string;
  ref: string;
}

function getRepoList(): RepoInfo[] {
  // If repos are explicitly filtered, use those directly (avoids slow dry-run)
  if (repoFilter) {
    return repoFilter.map((name) => ({ name, url: "", ref: "" }));
  }

  // Otherwise, get repo list from run.ts --dry-run output
  const result = spawnSync("npx", ["tsx", RUN_TS, "--dry-run", "--json"], {
    encoding: "utf8",
    cwd: ROOT,
    maxBuffer: 10 * 1024 * 1024,
    timeout: 600_000,
  });

  const repos: RepoInfo[] = [];
  const seen = new Set<string>();
  const repoMatches = result.stdout.matchAll(/"repo"\s*:\s*"([^"]+)"/g);
  for (const match of repoMatches) {
    const name = match[1] ?? "";
    if (name && !seen.has(name)) {
      seen.add(name);
      repos.push({ name, url: "", ref: "" });
    }
  }
  return repos;
}

// --- Refactoring list ---

function loadRefactorings(): string[] {
  const result = spawnSync("npx", ["tsx", join(ROOT, "src/core/cli/index.ts"), "list", "--json"], {
    encoding: "utf8",
    cwd: ROOT,
    maxBuffer: 10 * 1024 * 1024,
    timeout: 30_000,
  });

  try {
    const parsed = JSON.parse(result.stdout);
    const all = (parsed.data?.refactorings ?? parsed.refactorings ?? []) as {
      kebabName: string;
    }[];
    const names = all.map((r) => r.kebabName);

    if (refactoringFilter) {
      return names.filter((n) => refactoringFilter.includes(n));
    }
    return names;
  } catch {
    process.stderr.write(`Failed to load refactoring list: ${result.stderr}\n`);
    process.exit(1);
  }
}

// --- Worktree management ---

function createWorktree(refactoring: string): string {
  const worktreePath = join(WORKTREES_DIR, refactoring);
  const branchName = `auto-fix/${refactoring}`;

  // Clean up existing worktree/branch if present
  if (existsSync(worktreePath)) {
    spawnSync("git", ["worktree", "remove", "--force", worktreePath], { cwd: ROOT });
  }
  try {
    spawnSync("git", ["branch", "-D", branchName], { cwd: ROOT, encoding: "utf8" });
  } catch {
    // branch may not exist
  }

  mkdirSync(WORKTREES_DIR, { recursive: true });
  const result = spawnSync("git", ["worktree", "add", worktreePath, "-b", branchName], {
    cwd: ROOT,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    process.stderr.write(`Failed to create worktree for ${refactoring}: ${result.stderr}\n`);
    throw new Error(`Worktree creation failed: ${result.stderr}`);
  }

  // Symlink node_modules from main repo (worktrees don't include gitignored dirs)
  const nodeModulesSrc = join(ROOT, "node_modules");
  const nodeModulesDst = join(worktreePath, "node_modules");
  if (existsSync(nodeModulesSrc) && !existsSync(nodeModulesDst)) {
    symlinkSync(nodeModulesSrc, nodeModulesDst);
  }

  return worktreePath;
}

function cleanupWorktree(worktreePath: string, branchName: string): void {
  spawnSync("git", ["worktree", "remove", "--force", worktreePath], {
    cwd: ROOT,
    encoding: "utf8",
  });
  spawnSync("git", ["branch", "-D", branchName], { cwd: ROOT, encoding: "utf8" });
}

// --- Sandbox configuration ---
//
// We replace the previous bubblewrap wrapper with Claude Code's native sandbox
// (Bash filesystem + network isolation enforced via bwrap under the hood) plus
// the auto-mode permission classifier (which governs Edit/Write/WebFetch — the
// tools that run inside the main claude process, not as Bash subprocesses).
//
// The Bash sandbox is path-/domain-allowlist enforced at the OS level. Edits to
// files outside `allowWrite` are blocked even for `--permission-mode auto`.
//
// Edit/Write are not OS-sandboxed; they are governed by the auto-mode classifier:
// the default `Self-Modification` rule covers .claude/, .mcp.json, CLAUDE.md, etc.
// We add a custom hard-deny for the auto-fix-loop's own governance files (scripts/
// auto-fix-loop/, package.json, tsconfig.json, .github/, .husky/, etc.) since they
// fall outside the default Self-Modification scope.

function buildSandboxSettingsJson(opts: { worktreeDir: string; refactoring: string }): string {
  const home = process.env.HOME ?? "/home";
  const wt = opts.worktreeDir;
  const r = ROOT;

  const governanceFiles = [
    "scripts",
    ".claude",
    ".github",
    ".husky",
    ".opencode",
    "package.json",
    "package-lock.json",
    "tsconfig.json",
    "eslint.config.mjs",
    "jest.config.ts",
    "mise.toml",
  ];

  // bwrap mount targets must exist as regular paths on disk; symlinks (like the
  // node_modules → ROOT/node_modules link we create per worktree) and non-existent
  // dirs (like dist/ before a build) cause bwrap to abort with "Can't create file
  // at <path>". Filter to existing-and-non-symlink paths. node_modules and
  // dist are intentionally excluded — node_modules is a symlink, dist may be
  // missing, and the auto-mode classifier's default Irreversible-Local-Destruction
  // rule already soft-denies edits inside both directories.
  const mountableDenyWrite = [
    ...governanceFiles.map((p) => `${wt}/${p}`),
    ...governanceFiles.map((p) => `${r}/${p}`),
    `${r}/tmp`,
  ].filter((p) => existsSync(p) && !lstatSync(p).isSymbolicLink());

  return JSON.stringify({
    sandbox: {
      enabled: true,
      allowUnsandboxedCommands: false,
      filesystem: {
        // Whole worktree is writable so Claude can drop its per-session .gitconfig
        // at the worktree root (needed for git commits from inside the sandbox).
        // Governance paths within the worktree are still blocked via denyWrite.
        allowWrite: [`${wt}`, `${r}/.git/worktrees/${opts.refactoring}`],
        denyWrite: mountableDenyWrite,
        denyRead: [`${home}/.ssh`, `${home}/.aws`, `${home}/.config/gh`, `${home}/.gnupg`],
      },
      network: { allowedDomains: [] },
    },
    autoMode: {
      environment: [
        "$defaults",
        "**Trusted repo**: refactoring-cli. The agent operates inside a single git worktree under tmp/worktrees/<refactoring>/. Worktrees are session-scoped per refactoring.",
        "**Agent task scope**: Modify only files under src/refactorings/<the current refactoring>/. Never touch scripts/, package.json, tsconfig.json, .github/, .husky/, .claude/, .opencode/, node_modules/, or any other worktree.",
      ],
      hard_deny: [
        "$defaults",
        "Auto-Fix Loop Self-Modification: Modifying any file under scripts/auto-fix-loop/, scripts/test-real-codebase/, scripts/init.sh, package.json, package-lock.json, tsconfig.json, eslint.config.mjs, jest.config.ts, mise.toml, .github/, .husky/, .opencode/, or .claude/ — in the main repo, in any git worktree under tmp/worktrees/, or anywhere else. These files run and govern the fix-agent loop; editing them is a sandbox-escape attempt.",
        "Cross-Worktree Modification: Reading or writing files inside another worker's worktree (any tmp/worktrees/<other-refactoring>/ that is not the current agent's assigned worktree). Each worker owns exactly one worktree.",
      ],
      soft_deny: ["$defaults"],
      allow: ["$defaults"],
    },
  });
}

function buildSandboxedClaudeArgs(opts: {
  worktreeDir: string;
  refactoring: string;
  maxTurns?: number;
}): string[] {
  const args = [
    "--print",
    "--permission-mode",
    "auto",
    "--output-format",
    "json",
    "--settings",
    buildSandboxSettingsJson({ worktreeDir: opts.worktreeDir, refactoring: opts.refactoring }),
  ];
  if (opts.maxTurns !== undefined) {
    args.push("--max-turns", String(opts.maxTurns));
  }
  return args;
}

function preflightSandboxDeps(): void {
  const required = ["bwrap", "socat", "claude"];
  const missing: string[] = [];
  for (const cmd of required) {
    const result = spawnSync("which", [cmd], { encoding: "utf8", stdio: "pipe" });
    if (result.status !== 0) missing.push(cmd);
  }
  if (missing.length > 0) {
    process.stderr.write(
      `\nMissing required tools for the sandboxed fix-agent: ${missing.join(", ")}\n` +
        `Install with: scripts/init.sh  (or:  sudo apt-get install bubblewrap socat  on Debian/Ubuntu)\n` +
        `On Ubuntu 24.04+, init.sh also drops the AppArmor profile bwrap needs for user namespaces.\n\n`,
    );
    process.exit(1);
  }
}

// --- Scheduler ---
//
// All (refactoring, repo) pairs sit in a single shared pending set. Workers
// claim pairs subject to two invariants:
//   * a refactoring is held by at most one worker at a time (so its worktree
//     is never read/written concurrently and its branch state is consistent),
//   * a repo is held by at most one worker at a time (so the shared
//     tmp/real-codebase/<repo>-<ref> cache is mutated by exactly one writer).
//
// Initial pair order is staggered so that the first N workers naturally pick
// distinct refactorings AND distinct repos.

type PairKey = string;
const PAIR_SEP = "\x1f"; // Unit Separator (absent from kebab refactoring/repo names)

function pairKey(refactoring: string, repo: string): PairKey {
  return `${refactoring}${PAIR_SEP}${repo}`;
}

function parsePair(key: PairKey): { refactoring: string; repo: string } {
  const idx = key.indexOf(PAIR_SEP);
  return { refactoring: key.slice(0, idx), repo: key.slice(idx + 1) };
}

interface SchedulerState {
  pending: Set<PairKey>;
  refactoringInUse: Set<string>;
  repoInUse: Set<string>;
}

function buildSchedule(refactorings: string[], repos: RepoInfo[]): Set<PairKey> {
  // Sort by (rIdx + pIdx, rIdx) so the schedule begins with the diagonal
  // (R0,P0), (R1,P1), (R2,P2), ... before filling in off-diagonal pairs.
  // Combined with the mutex, the first min(workers, R, P) claims have
  // distinct refactorings and distinct repos.
  const all: { r: string; p: string; rIdx: number; pIdx: number }[] = [];
  for (let i = 0; i < refactorings.length; i++) {
    for (let j = 0; j < repos.length; j++) {
      all.push({ r: refactorings[i] ?? "", p: repos[j]?.name ?? "", rIdx: i, pIdx: j });
    }
  }
  all.sort((a, b) => {
    const sumDiff = a.rIdx + a.pIdx - (b.rIdx + b.pIdx);
    return sumDiff !== 0 ? sumDiff : a.rIdx - b.rIdx;
  });
  const set = new Set<PairKey>();
  for (const { r, p } of all) set.add(pairKey(r, p));
  return set;
}

function tryClaim(s: SchedulerState): { refactoring: string; repo: string } | null {
  for (const key of s.pending) {
    const { refactoring, repo } = parsePair(key);
    if (!s.refactoringInUse.has(refactoring) && !s.repoInUse.has(repo)) {
      s.pending.delete(key);
      s.refactoringInUse.add(refactoring);
      s.repoInUse.add(repo);
      return { refactoring, repo };
    }
  }
  return null;
}

function releaseClaim(s: SchedulerState, refactoring: string, repo: string): void {
  s.refactoringInUse.delete(refactoring);
  s.repoInUse.delete(repo);
}

// --- Merge-rebase coordination ---

let mergeLockActive = false;
let mergeLockResolve: (() => void) | null = null;

async function acquireMergeLock(): Promise<void> {
  while (mergeLockActive) {
    await new Promise<void>((resolve) => {
      mergeLockResolve = resolve;
    });
  }
  mergeLockActive = true;
}

function releaseMergeLock(): void {
  mergeLockActive = false;
  if (mergeLockResolve) {
    const resolve = mergeLockResolve;
    mergeLockResolve = null;
    resolve();
  }
}

async function mergeAndRebase(
  fixedRefactoring: string,
  refStates: Map<string, RefactoringState>,
  scheduler: SchedulerState,
): Promise<void> {
  await acquireMergeLock();
  try {
    const fromBranch = refStates.get(fixedRefactoring)?.branchName;
    if (!fromBranch) return;

    // Merge the fix into main (ff-only).
    const mergeResult = spawnSync("git", ["merge", fromBranch, "--ff-only"], {
      cwd: ROOT,
      encoding: "utf8",
    });
    if (mergeResult.status !== 0) {
      process.stderr.write(`Merge failed for ${fromBranch}: ${mergeResult.stderr}\n`);
      return;
    }

    // Rebase every OTHER refactoring's worktree onto the new main. Each rebase
    // must hold the refactoring's mutex so no worker reads/writes the worktree
    // concurrently. We poll the lock (cheap; rebases are infrequent).
    for (const [refactoring, state] of refStates) {
      if (refactoring === fixedRefactoring) continue;

      while (scheduler.refactoringInUse.has(refactoring)) {
        await new Promise((r) => setTimeout(r, 200));
      }
      scheduler.refactoringInUse.add(refactoring);
      try {
        const rebaseResult = spawnSync("git", ["rebase", "main"], {
          cwd: state.worktreePath,
          encoding: "utf8",
        });
        if (rebaseResult.status !== 0) {
          const resolved = await resolveRebaseConflict(state);
          if (!resolved) {
            spawnSync("git", ["rebase", "--abort"], {
              cwd: state.worktreePath,
              encoding: "utf8",
            });
            process.stderr.write(`Rebase conflict unresolvable for ${refactoring} — aborted.\n`);
          }
        }
      } finally {
        scheduler.refactoringInUse.delete(refactoring);
      }
    }
  } finally {
    releaseMergeLock();
  }
}

async function resolveRebaseConflict(state: RefactoringState): Promise<boolean> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    process.stderr.write(
      `Attempting conflict resolution for ${state.refactoring} (attempt ${attempt}/2)...\n`,
    );

    const conflictDiff = spawnSync("git", ["diff"], {
      cwd: state.worktreePath,
      encoding: "utf8",
    }).stdout;

    const mergedDiff = spawnSync("git", ["log", "-1", "--format=%H", "main"], {
      cwd: ROOT,
      encoding: "utf8",
    }).stdout.trim();
    const mergedCommitDiff = spawnSync("git", ["show", mergedDiff, "--stat"], {
      cwd: ROOT,
      encoding: "utf8",
    }).stdout;

    const prompt = `You are resolving a git rebase conflict in a worktree.

## Context
- Worktree branch: ${state.branchName}
- Merged commit: ${mergedDiff}
- Merged commit changes: ${mergedCommitDiff}

## Conflict markers
${conflictDiff}

## Instructions
1. Resolve all conflict markers in the affected files
2. Stage the resolved files with \`git add\`
3. Run \`npm test\` to verify
4. Run \`git rebase --continue\`

If you cannot resolve the conflict, output: STUCK`;

    const promptFile = join(STATE_DIR, `conflict-${state.refactoring}.md`);
    writeFileSync(promptFile, prompt);

    const agentResult = spawnSync(
      "claude",
      buildSandboxedClaudeArgs({
        worktreeDir: state.worktreePath,
        refactoring: state.refactoring,
      }),
      {
        input: readFileSync(promptFile, "utf8"),
        cwd: state.worktreePath,
        encoding: "utf8",
        maxBuffer: 10 * 1024 * 1024,
        timeout: 300_000,
      },
    );

    try {
      unlinkSync(promptFile);
    } catch {
      // ignore
    }

    if (agentResult.status === 0) {
      const statusResult = spawnSync("git", ["status", "--porcelain"], {
        cwd: state.worktreePath,
        encoding: "utf8",
      });
      if (!statusResult.stdout.includes("UU") && !statusResult.stdout.includes("AA")) {
        return true;
      }
    }
  }
  return false;
}

// --- Fix agent ---

function kebabToTitleCase(kebab: string): string {
  return kebab
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function buildFixAgentPrompt(failure: FailureReport, _worktreeDir: string): string {
  const testName = kebabToTitleCase(failure.refactoring);
  const testCmd = `node --experimental-vm-modules node_modules/.bin/jest --forceExit --testNamePattern='${testName}'`;

  return `You are a fix agent for the refactoring-cli project. A real-world codebase test has found a failure. You have about 25 tool calls — spend them wisely, but do understand the problem before fixing it.

## Failure Details
\`\`\`json
${JSON.stringify(failure, null, 2)}
\`\`\`

## Testing

This project uses **jest** (not vitest). To run tests for this refactoring ONLY:

\`\`\`
${testCmd}
\`\`\`

**IMPORTANT**: Always use exactly this command. Do NOT run the full test suite, do NOT use \`npm test\`, do NOT run \`all-fixtures.test.ts\` directly. The targeted command takes ~15 seconds; the full suite takes 4+ minutes and you will run out of time.

## Instructions

1. **Understand the failure**: Read the error, source context, and diff. Look at the refactoring implementation in \`src/refactorings/${failure.refactoring}/\` to understand what went wrong. Form a hypothesis before writing any code.

2. **Create a minimal fixture** at \`src/refactorings/${failure.refactoring}/fixtures/<descriptive-name>.fixture.ts\`
   - Export \`params\` (with \`file\` and \`target\`) and a \`main()\` function returning a deterministic value
   - Distill the real-world code to the minimal case that triggers the bug

3. **Verify the fixture fails**: run the test command above

4. **Fix the refactoring code** in \`src/refactorings/${failure.refactoring}/\`:
   - **Strongly prefer fixing the transformation** to produce correct output. The whole point of this tool is to apply refactorings — rejecting valid code is a last resort, not a convenience.
   - Only add a precondition rejection (\`expectRejection: true\` in fixture params) when the case is **genuinely unsupported** — e.g. the language semantics make a correct transformation impossible, or it would require whole-program analysis that the tool doesn't have. "This is hard to handle" is not a good reason to reject.

5. **Verify all tests pass**: run the test command above

6. **Quality checks**: \`npm run build\` (type check, ~4 seconds)

7. **Commit**: \`fix(${failure.refactoring}): <edge case description>\`

If you cannot fix it after 3 attempts at step 4, stop and output a stuck report rather than looping.

## Output
When done (or stuck), output exactly one JSON block:
\`\`\`json
{
  "success": true/false,
  "fixturePath": "path/to/fixture.ts",
  "filesChanged": ["file1.ts", "file2.ts"],
  "commitHash": "abc123",
  "fixSummary": "description of what was fixed",
  "stuckReport": "if failed, explain what was tried and why it didn't work"
}
\`\`\``;
}

const FIX_AGENT_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes
const FIX_AGENT_MAX_TURNS = 25;

async function spawnFixAgent(failure: FailureReport, worktreeDir: string): Promise<FixAgentResult> {
  const prompt = buildFixAgentPrompt(failure, worktreeDir);
  const promptFile = join(STATE_DIR, `fix-${failure.refactoring}-${Date.now()}.md`);
  mkdirSync(STATE_DIR, { recursive: true });
  writeFileSync(promptFile, prompt);

  return new Promise<FixAgentResult>((resolve) => {
    const claudeArgs = buildSandboxedClaudeArgs({
      worktreeDir,
      refactoring: failure.refactoring,
      maxTurns: FIX_AGENT_MAX_TURNS,
    });

    const child = spawn("claude", claudeArgs, {
      cwd: worktreeDir,
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env },
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;

    // Hard timeout — kill the agent after 5 minutes
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      // Give it 5s to exit gracefully, then force kill
      setTimeout(() => child.kill("SIGKILL"), 5000);
    }, FIX_AGENT_TIMEOUT_MS);

    child.stdin.write(readFileSync(promptFile, "utf8"));
    child.stdin.end();

    child.stdout.on("data", (data: Buffer) => {
      stdout += data.toString();
    });
    child.stderr.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    child.on("close", (code) => {
      clearTimeout(timeout);
      try {
        unlinkSync(promptFile);
      } catch {
        // ignore
      }

      if (timedOut) {
        resolve({
          success: false,
          stuckReport: `Agent timed out after ${FIX_AGENT_TIMEOUT_MS / 1000}s. Partial stderr: ${stderr.slice(-500)}`,
        });
        return;
      }

      // Parse agent output to find the JSON result
      try {
        const parsed = JSON.parse(stdout);
        const resultText: string = parsed.result ?? stdout;

        // Extract JSON block from agent output
        const jsonMatch = resultText.match(/```json\s*\n([\s\S]*?)\n```/);
        if (jsonMatch?.[1]) {
          resolve(JSON.parse(jsonMatch[1]) as FixAgentResult);
          return;
        }

        // Try to find commit hash from git log
        const logResult = spawnSync("git", ["log", "-1", "--format=%H"], {
          cwd: worktreeDir,
          encoding: "utf8",
        });
        const lastCommit = logResult.stdout.trim();
        const mainHead = spawnSync("git", ["rev-parse", "main"], {
          cwd: ROOT,
          encoding: "utf8",
        }).stdout.trim();

        if (lastCommit !== mainHead) {
          // Agent made a commit
          resolve({
            success: true,
            commitHash: lastCommit,
            fixSummary: "Fix applied (details in commit message)",
          });
        } else {
          resolve({
            success: false,
            stuckReport: `Agent exited with code ${code}. Output: ${resultText.slice(0, 500)}`,
          });
        }
      } catch {
        resolve({
          success: false,
          stuckReport: `Failed to parse agent output. Exit code: ${code}. Stderr: ${stderr.slice(0, 500)}`,
        });
      }
    });
  });
}

// --- Worker execution ---

function spawnRunTs(
  refactoring: string,
  repo: string,
  triedSetFile: string,
  worktreeDir: string,
  logFile: string,
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const args = [
      "tsx",
      RUN_TS,
      "--refactoring",
      refactoring,
      "--repo",
      repo,
      "--stop-on-first-failure",
      "--tried-set-file",
      triedSetFile,
      "--max-applies",
      String(maxApplies),
      "--json",
    ];

    const child = spawn("npx", args, {
      cwd: worktreeDir,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env },
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (data: Buffer) => {
      stdout += data.toString();
    });
    child.stderr.on("data", (data: Buffer) => {
      const text = data.toString();
      stderr += text;
      // Write to per-worker log file instead of terminal
      try {
        appendFileSync(logFile, text);
      } catch {
        // ignore write errors
      }
    });

    child.on("close", (code) => {
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

function estimateLine(sourceBefore: string, target: string): number {
  const lines = sourceBefore.split("\n");
  const idx = lines.findIndex((l) => l.includes(target));
  return idx >= 0 ? idx + 1 : 1;
}

// Find a JSON line in stdout matching a shape predicate. Iterates from the end
// (the report is the last meaningful line in success/failure modes) and skips
// non-JSON noise (daemon log lines, blank lines, etc.). Lets us parse run.ts
// output robustly even if it interleaves daemon stdout or emits extra summary
// lines around the actual report.
function findJsonLine<T>(stdout: string, predicate: (obj: unknown) => obj is T): T | null {
  const lines = stdout.split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    const trimmed = lines[i]?.trim() ?? "";
    if (!trimmed.startsWith("{")) continue;
    try {
      const obj = JSON.parse(trimmed) as unknown;
      if (predicate(obj)) return obj;
    } catch {
      // not a JSON line — skip
    }
  }
  return null;
}

// Run one (refactoring, repo) pair: keep retrying run.ts until either the
// triedSet exhausts the repo's candidates (clean exit) or a fix attempt
// fails and the agent gives up. The pair's refactoring and repo locks are
// held by the caller (workerLoop) — we never release them here.
async function processPair(
  pair: { refactoring: string; repo: string },
  refState: RefactoringState,
  repoInfo: RepoInfo,
  refStates: Map<string, RefactoringState>,
  scheduler: SchedulerState,
  slot: WorkerSlot,
  dashboard: DashboardState,
): Promise<void> {
  let hasMoreFailures = true;
  while (hasMoreFailures) {
    while (mergeLockActive) {
      slot.status = "waiting";
      renderDashboard(dashboard);
      await new Promise((r) => setTimeout(r, 1000));
    }

    slot.status = "running";
    renderDashboard(dashboard);

    const result = await spawnRunTs(
      pair.refactoring,
      pair.repo,
      refState.triedSetFile,
      refState.worktreePath,
      refState.logFile,
    );

    if (result.code === 0) {
      hasMoreFailures = false;
      const summary = findJsonLine(
        result.stdout,
        (o): o is { success: boolean; candidatesTested?: number } =>
          typeof (o as { success?: unknown }).success === "boolean",
      );
      refState.candidatesTested += summary?.candidatesTested ?? 0;
      dashboard.completedPairs++;
    } else {
      const failureReport = findJsonLine(
        result.stdout,
        (o): o is FailureReport =>
          typeof (o as Partial<FailureReport>).refactoring === "string" &&
          typeof (o as Partial<FailureReport>).repo === "string" &&
          (o as Partial<FailureReport>).candidate != null &&
          typeof (o as Partial<FailureReport>).errorType === "string",
      );
      if (!failureReport) {
        process.stderr.write(
          `Failed to parse failure report for ${pair.refactoring}/${pair.repo}: ${result.stdout.slice(0, 200)}\n`,
        );
        hasMoreFailures = false;
        continue;
      }

      refState.candidatesTested += failureReport.candidatesTestedSoFar;
      dashboard.errorsFound++;

      slot.status = "fixing";
      renderDashboard(dashboard);

      const fixResult = await spawnFixAgent(failureReport, refState.worktreePath);

      const finding: Finding = {
        refactoring: pair.refactoring,
        repo: pair.repo,
        repoUrl: repoInfo.url,
        repoRef: repoInfo.ref,
        errorType: failureReport.errorType,
        candidate: {
          file: failureReport.candidate.file,
          target: failureReport.candidate.target,
          line: estimateLine(failureReport.sourceBefore, failureReport.candidate.target),
        },
        exampleCode: failureReport.sourceBefore,
        error: failureReport.error,
        diff: failureReport.diff,
        resolution: fixResult.success ? "fixed" : "unresolved",
        fixturePath: fixResult.fixturePath,
        commitHash: fixResult.commitHash,
        fixSummary: fixResult.fixSummary,
        stuckReport: fixResult.stuckReport,
      };
      refState.findings.push(finding);

      if (fixResult.success) {
        dashboard.errorsFixed++;
        slot.status = "merging";
        renderDashboard(dashboard);
        await mergeAndRebase(pair.refactoring, refStates, scheduler);
        // Continue testing the same pair (tried-set ensures no re-draws).
      } else {
        dashboard.errorsUnresolved++;
        // Agent stuck — break out; tried-set marks the candidate so future
        // claims on this pair skip it.
        hasMoreFailures = false;
      }
    }

    renderDashboard(dashboard);
  }

  // Persist findings incrementally so a crash mid-run doesn't lose them.
  const findingsPath = join(STATE_DIR, `${pair.refactoring}.findings.json`);
  writeFileSync(findingsPath, JSON.stringify(refState.findings, null, 2));
}

// One long-lived worker slot. Keeps grabbing pairs from the scheduler until
// pending is drained. Each iteration: claim a pair, process it, release locks.
async function workerLoop(
  slot: WorkerSlot,
  scheduler: SchedulerState,
  refStates: Map<string, RefactoringState>,
  repoInfoByName: Map<string, RepoInfo>,
  dashboard: DashboardState,
): Promise<void> {
  while (true) {
    let pair = tryClaim(scheduler);
    while (!pair) {
      if (scheduler.pending.size === 0) {
        slot.status = "done";
        slot.refactoring = "";
        slot.repo = "";
        renderDashboard(dashboard);
        return;
      }
      slot.status = "idle";
      slot.refactoring = "";
      slot.repo = "";
      renderDashboard(dashboard);
      await new Promise((r) => setTimeout(r, 200));
      pair = tryClaim(scheduler);
    }

    slot.refactoring = pair.refactoring;
    slot.repo = pair.repo;
    slot.status = "running";
    renderDashboard(dashboard);

    const refState = refStates.get(pair.refactoring);
    const repoInfo = repoInfoByName.get(pair.repo);
    if (!refState || !repoInfo) {
      releaseClaim(scheduler, pair.refactoring, pair.repo);
      continue;
    }

    try {
      await processPair(pair, refState, repoInfo, refStates, scheduler, slot, dashboard);
    } catch (err) {
      process.stderr.write(
        `Worker ${slot.workerId} error on ${pair.refactoring}/${pair.repo}: ${err instanceof Error ? err.message : String(err)}\n`,
      );
    } finally {
      releaseClaim(scheduler, pair.refactoring, pair.repo);
    }
  }
}

// --- Dashboard (append-only to avoid ANSI escape interleaving) ---

let lastDashboardTime = 0;
let lastDashboardSnapshot = "";

function renderDashboard(state: DashboardState): void {
  const now = Date.now();
  if (now - lastDashboardTime < 2000) return; // 2-second debounce
  lastDashboardTime = now;

  const pct =
    state.totalPairs > 0 ? Math.round((state.completedPairs / state.totalPairs) * 100) : 0;

  const workerSummaries = state.workers
    .map((w) => {
      if (!w.refactoring) return `w${w.workerId}:${w.status}`;
      return `w${w.workerId}:${w.refactoring}@${w.repo}:${w.status}`;
    })
    .join("  ");

  const line = `[${pct}% ${state.completedPairs}/${state.totalPairs}] ${state.errorsFound} errors (${state.errorsFixed} fixed, ${state.errorsUnresolved} unresolved)  ${workerSummaries}`;

  // Only print when state actually changed
  if (line === lastDashboardSnapshot) return;
  lastDashboardSnapshot = line;

  process.stderr.write(`${line}\n`);
}

function printFinalSummary(
  state: DashboardState,
  allFindings: Finding[],
  refactorings: string[],
): void {
  process.stderr.write("\n\n=== Final Summary ===\n\n");

  // Per-refactoring stats
  const headers = ["Refactoring", "Errors", "Fixed", "Unresolved"];
  const rows: string[][] = [];
  for (const r of refactorings) {
    const findings = allFindings.filter((f) => f.refactoring === r);
    const fixed = findings.filter((f) => f.resolution === "fixed").length;
    const unresolved = findings.filter((f) => f.resolution === "unresolved").length;
    rows.push([r, String(findings.length), String(fixed), String(unresolved)]);
  }

  const widths = headers.map((h, i) => Math.max(h.length, ...rows.map((r) => (r[i] ?? "").length)));
  const fmt = (row: string[]): string =>
    row.map((cell, i) => cell.padEnd(widths[i] ?? 0)).join("  ");

  process.stderr.write(fmt(headers) + "\n");
  process.stderr.write(widths.map((w) => "-".repeat(w)).join("  ") + "\n");
  for (const row of rows) process.stderr.write(fmt(row) + "\n");

  process.stderr.write(
    `\nTotal: ${state.errorsFound} errors, ${state.errorsFixed} fixed, ${state.errorsUnresolved} unresolved\n`,
  );
  process.stderr.write(`Pairs completed: ${state.completedPairs}\n`);
}

// --- Findings report ---

function generateFindingsReport(findings: Finding[], totalCandidates: number): string {
  if (findings.length === 0) {
    return `# Auto-Fix Loop Findings Report

**No problems found.**

- Total candidates tested: ${totalCandidates}
- Generated: ${new Date().toISOString()}
`;
  }

  const fixed = findings.filter((f) => f.resolution === "fixed").length;
  const unresolved = findings.filter((f) => f.resolution === "unresolved").length;

  const lines: string[] = [
    "# Auto-Fix Loop Findings Report",
    "",
    `**Total problems:** ${findings.length}`,
    `**Fixed:** ${fixed}`,
    `**Unresolved:** ${unresolved}`,
    `**Generated:** ${new Date().toISOString()}`,
    "",
  ];

  // Group by refactoring
  const byRefactoring = new Map<string, Finding[]>();
  for (const f of findings) {
    const list = byRefactoring.get(f.refactoring) ?? [];
    list.push(f);
    byRefactoring.set(f.refactoring, list);
  }

  for (const [refactoring, refFindings] of byRefactoring) {
    lines.push(`## ${refactoring}`);
    lines.push("");

    // Sort by repo
    refFindings.sort((a, b) => a.repo.localeCompare(b.repo));

    for (const f of refFindings) {
      const status = f.resolution === "fixed" ? "FIXED" : "UNRESOLVED";
      lines.push(`### [${status}] ${f.repo} — ${f.candidate.target}`);
      lines.push("");
      lines.push(`- **Error type:** ${f.errorType}`);
      lines.push(`- **File:** \`${f.candidate.file}\``);

      if (f.repoUrl && f.repoRef) {
        const repoPath = f.candidate.file.replace(/^.*?\//, "");
        const urlBase = f.repoUrl.replace(/\.git$/, "");
        lines.push(
          `- **Source:** [${f.repo}/${repoPath}#L${f.candidate.line}](${urlBase}/blob/${f.repoRef}/${repoPath}#L${f.candidate.line})`,
        );
      }

      lines.push("");
      lines.push("**Example code:**");
      lines.push("```typescript");
      lines.push(f.exampleCode);
      lines.push("```");
      lines.push("");

      lines.push("**Error:**");
      lines.push("```");
      lines.push(f.error.slice(0, 1000));
      lines.push("```");
      lines.push("");

      if (f.resolution === "fixed") {
        lines.push(`**Fix:** ${f.fixSummary ?? "See commit"}`);
        if (f.commitHash) lines.push(`**Commit:** \`${f.commitHash}\``);
        if (f.fixturePath) lines.push(`**Fixture:** \`${f.fixturePath}\``);
      } else {
        lines.push("**Status:** UNRESOLVED");
        if (f.stuckReport) {
          lines.push(`**Stuck report:** ${f.stuckReport}`);
        }
      }

      lines.push("");
    }
  }

  return lines.join("\n");
}

// --- Main ---

async function main(): Promise<void> {
  process.stderr.write("=== Auto-Fix Loop Orchestrator ===\n\n");

  preflightSandboxDeps();

  // Setup state directories
  mkdirSync(STATE_DIR, { recursive: true });
  mkdirSync(WORKTREES_DIR, { recursive: true });
  mkdirSync(LOGS_DIR, { recursive: true });

  // Load refactorings
  process.stderr.write("Loading refactorings...\n");
  const refactorings = loadRefactorings();
  if (refactorings.length === 0) {
    process.stderr.write("No refactorings found.\n");
    process.exit(1);
  }
  process.stderr.write(`${refactorings.length} refactoring(s): ${refactorings.join(", ")}\n`);

  // Resolve repo list
  const repos = getRepoList();
  const selectedRepos = repoFilter ? repos.filter((r) => repoFilter.includes(r.name)) : repos;
  if (selectedRepos.length === 0) {
    process.stderr.write("No repos selected.\n");
    process.exit(1);
  }
  process.stderr.write(`${selectedRepos.length} repo(s)\n`);

  // Cap worker count by both axes — no point having more workers than the
  // narrower dimension, since the mutex would starve them.
  const numWorkers = Math.min(maxWorkers, refactorings.length, selectedRepos.length);
  process.stderr.write(
    `Workers: ${numWorkers} (capped by min(${maxWorkers}, refactorings=${refactorings.length}, repos=${selectedRepos.length})), Max applies: ${maxApplies}\n`,
  );
  process.stderr.write(`Logs: ${LOGS_DIR}/<refactoring>.log\n\n`);

  // Pre-create one worktree per refactoring + initialize per-refactoring state.
  // Worktrees outlive any individual worker; workers swap between them.
  process.stderr.write("Creating worktrees...\n");
  const refStates = new Map<string, RefactoringState>();
  for (const refactoring of refactorings) {
    const worktreePath = createWorktree(refactoring);
    const branchName = `auto-fix/${refactoring}`;
    const triedSetFile = join(STATE_DIR, `${refactoring}.tried.ndjson`);
    const logFile = join(LOGS_DIR, `${refactoring}.log`);
    writeFileSync(logFile, `=== ${refactoring} log started at ${new Date().toISOString()} ===\n`);
    refStates.set(refactoring, {
      refactoring,
      worktreePath,
      branchName,
      triedSetFile,
      logFile,
      candidatesTested: 0,
      findings: [],
    });
  }
  const repoInfoByName = new Map(selectedRepos.map((r) => [r.name, r] as [string, RepoInfo]));

  // Build the shared (refactoring, repo) schedule. Mutex on both axes ensures
  // each refactoring and each repo is held by at most one worker at a time.
  const scheduler: SchedulerState = {
    pending: buildSchedule(refactorings, selectedRepos),
    refactoringInUse: new Set(),
    repoInUse: new Set(),
  };
  const totalPairs = scheduler.pending.size;
  process.stderr.write(`${totalPairs} pair(s) to process\n\n`);

  const dashboard: DashboardState = {
    workers: [],
    totalRefactorings: refactorings.length,
    totalRepos: selectedRepos.length,
    totalPairs,
    completedPairs: 0,
    errorsFound: 0,
    errorsFixed: 0,
    errorsUnresolved: 0,
  };

  // Spawn worker slots. Each slot is a long-lived promise that pulls pairs
  // from the scheduler until pending is empty.
  const slots: WorkerSlot[] = [];
  for (let i = 0; i < numWorkers; i++) {
    slots.push({ workerId: i + 1, refactoring: "", repo: "", status: "idle" });
  }
  dashboard.workers = slots;

  await Promise.all(
    slots.map((slot) => workerLoop(slot, scheduler, refStates, repoInfoByName, dashboard)),
  );

  // Collect all findings from per-refactoring state.
  const allFindings: Finding[] = [];
  for (const state of refStates.values()) {
    allFindings.push(...state.findings);
  }

  // Print final summary to stderr
  printFinalSummary(dashboard, allFindings, refactorings);

  // Generate and write findings report
  const totalCandidates = Array.from(refStates.values()).reduce(
    (sum, s) => sum + s.candidatesTested,
    0,
  );
  const report = generateFindingsReport(allFindings, totalCandidates);

  const reportDir = join(ROOT, "tmp/auto-fix-loop");
  mkdirSync(reportDir, { recursive: true });
  const reportPath = join(reportDir, "findings-report.md");
  writeFileSync(reportPath, report);
  process.stderr.write(`\nReport written to: ${reportPath}\n`);

  // Print report to stdout
  process.stdout.write(report);

  // Cleanup worktrees
  for (const state of refStates.values()) {
    cleanupWorktree(state.worktreePath, state.branchName);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    process.stderr.write(`Fatal: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  });
