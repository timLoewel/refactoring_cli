import { spawn, spawnSync } from "child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, unlinkSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const RUN_TS = join(ROOT, "scripts/test-real-codebase/run.ts");
const STATE_DIR = join(ROOT, "tmp/auto-fix-state");
const WORKTREES_DIR = join(ROOT, "tmp/worktrees");

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

interface WorkerState {
  refactoring: string;
  worktreePath: string;
  branchName: string;
  currentRepo: string;
  candidatesTested: number;
  status: "running" | "fixing" | "waiting" | "done";
  findings: Finding[];
  triedSetFile: string;
}

interface DashboardState {
  workers: WorkerState[];
  totalRefactorings: number;
  totalRepos: number;
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
    const names = all.map((r) => r.kebabName).filter((n) => !n.endsWith("-python"));

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
  return worktreePath;
}

function cleanupWorktree(worktreePath: string, branchName: string): void {
  spawnSync("git", ["worktree", "remove", "--force", worktreePath], {
    cwd: ROOT,
    encoding: "utf8",
  });
  spawnSync("git", ["branch", "-D", branchName], { cwd: ROOT, encoding: "utf8" });
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

async function mergeAndRebase(fixWorker: WorkerState, allWorkers: WorkerState[]): Promise<void> {
  await acquireMergeLock();
  try {
    // Merge fix worker's branch into main (ff-only)
    const mergeResult = spawnSync("git", ["merge", fixWorker.branchName, "--ff-only"], {
      cwd: ROOT,
      encoding: "utf8",
    });
    if (mergeResult.status !== 0) {
      process.stderr.write(`Merge failed for ${fixWorker.branchName}: ${mergeResult.stderr}\n`);
      return;
    }

    // Rebase all other active worktrees
    for (const worker of allWorkers) {
      if (worker === fixWorker || worker.status === "done") continue;

      const rebaseResult = spawnSync("git", ["rebase", "main"], {
        cwd: worker.worktreePath,
        encoding: "utf8",
      });

      if (rebaseResult.status !== 0) {
        // Rebase conflict — try conflict-resolution agent
        const resolved = await resolveRebaseConflict(worker, fixWorker);
        if (!resolved) {
          // Abort rebase and discard worker's conflicting commit
          spawnSync("git", ["rebase", "--abort"], {
            cwd: worker.worktreePath,
            encoding: "utf8",
          });
          process.stderr.write(
            `Rebase conflict unresolvable for ${worker.refactoring} — aborted.\n`,
          );
        }
      }
    }
  } finally {
    releaseMergeLock();
  }
}

async function resolveRebaseConflict(
  conflictWorker: WorkerState,
  _mergedWorker: WorkerState,
): Promise<boolean> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    process.stderr.write(
      `Attempting conflict resolution for ${conflictWorker.refactoring} (attempt ${attempt}/2)...\n`,
    );

    // Get conflict context
    const conflictDiff = spawnSync("git", ["diff"], {
      cwd: conflictWorker.worktreePath,
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
- Worktree branch: ${conflictWorker.branchName}
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

    const promptFile = join(STATE_DIR, `conflict-${conflictWorker.refactoring}.md`);
    writeFileSync(promptFile, prompt);

    const agentResult = spawnSync(
      "claude",
      ["--print", "--dangerously-skip-permissions", "--output-format", "json"],
      {
        input: readFileSync(promptFile, "utf8"),
        cwd: conflictWorker.worktreePath,
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
      // Check if rebase was completed
      const statusResult = spawnSync("git", ["status", "--porcelain"], {
        cwd: conflictWorker.worktreePath,
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

function buildFixAgentPrompt(failure: FailureReport, _worktreeDir: string): string {
  return `You are a fix agent for the refactoring-cli project. A real-world codebase test has found a failure. You have about 25 tool calls — spend them wisely, but do understand the problem before fixing it.

## Failure Details
\`\`\`json
${JSON.stringify(failure, null, 2)}
\`\`\`

## Instructions

1. **Understand the failure**: Read the error, source context, and diff. Look at the refactoring implementation in \`src/refactorings/${failure.refactoring}/\` to understand what went wrong. Form a hypothesis before writing any code.

2. **Create a minimal fixture** at \`src/refactorings/${failure.refactoring}/fixtures/<descriptive-name>.fixture.ts\`
   - Export \`params\` (with \`file\` and \`target\`) and a \`main()\` function returning a deterministic value
   - Distill the real-world code to the minimal case that triggers the bug

3. **Verify the fixture fails**: \`npx vitest run src/refactorings/${failure.refactoring}\`

4. **Fix the refactoring code** in \`src/refactorings/${failure.refactoring}/\`:
   - Either fix the transformation to produce correct output
   - Or add a precondition that rejects the case (\`expectRejection: true\` in fixture params)

5. **Verify all tests pass**: \`npx vitest run src/refactorings/${failure.refactoring}\`

6. **Quality checks**: \`npm run lint && npm run build && npm test\`

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

const FIX_AGENT_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const FIX_AGENT_MAX_TURNS = 25;

async function spawnFixAgent(failure: FailureReport, worktreeDir: string): Promise<FixAgentResult> {
  const prompt = buildFixAgentPrompt(failure, worktreeDir);
  const promptFile = join(STATE_DIR, `fix-${failure.refactoring}-${Date.now()}.md`);
  mkdirSync(STATE_DIR, { recursive: true });
  writeFileSync(promptFile, prompt);

  // Resolve paths for bwrap bind mounts
  const homeDir = process.env.HOME ?? "/home";
  const claudeConfigDir = join(homeDir, ".claude");
  const nodeDir = spawnSync("which", ["node"], { encoding: "utf8" }).stdout.trim();
  const nodeBase = dirname(dirname(nodeDir)); // e.g. /home/user/.local/share/mise/installs/node/25.2.1

  return new Promise<FixAgentResult>((resolve) => {
    // Sandbox the agent with bubblewrap: read-write access to the worktree only,
    // read-only access to node, npm, claude CLI, and system libs
    const bwrapArgs = [
      "--die-with-parent",
      "--unshare-net", // no network (all deps are already installed)
      // System essentials (read-only)
      "--ro-bind",
      "/usr",
      "/usr",
      "--ro-bind",
      "/lib",
      "/lib",
      "--ro-bind",
      "/lib64",
      "/lib64",
      "--ro-bind",
      "/bin",
      "/bin",
      "--ro-bind",
      "/etc",
      "/etc",
      "--proc",
      "/proc",
      "--dev",
      "/dev",
      "--tmpfs",
      "/tmp",
      // Node runtime (read-only)
      "--ro-bind",
      nodeBase,
      nodeBase,
      // Claude CLI config (read-only)
      "--ro-bind",
      claudeConfigDir,
      claudeConfigDir,
      // The worktree itself (read-write — this is where the agent works)
      "--bind",
      worktreeDir,
      worktreeDir,
      // Fuzz state dir (read-write — for the prompt file)
      "--bind",
      STATE_DIR,
      STATE_DIR,
      // Working directory
      "--chdir",
      worktreeDir,
      // The command to run inside the sandbox
      "claude",
      "--print",
      "--dangerously-skip-permissions",
      "--output-format",
      "json",
      "--max-turns",
      String(FIX_AGENT_MAX_TURNS),
    ];

    const child = spawn("bwrap", bwrapArgs, {
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
      // Forward to orchestrator stderr for dashboard parsing
      process.stderr.write(text);
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

async function runWorker(
  refactoring: string,
  repos: RepoInfo[],
  allWorkers: WorkerState[],
  dashboard: DashboardState,
): Promise<Finding[]> {
  const worktreePath = createWorktree(refactoring);
  const branchName = `auto-fix/${refactoring}`;
  const triedSetFile = join(STATE_DIR, `${refactoring}.tried.ndjson`);
  mkdirSync(STATE_DIR, { recursive: true });

  const worker: WorkerState = {
    refactoring,
    worktreePath,
    branchName,
    currentRepo: "",
    candidatesTested: 0,
    status: "running",
    findings: [],
    triedSetFile,
  };
  allWorkers.push(worker);

  try {
    for (const repo of repos) {
      if (repoFilter && !repoFilter.includes(repo.name)) continue;

      worker.currentRepo = repo.name;
      worker.status = "running";
      renderDashboard(dashboard);

      // Inner loop: run until no more failures on this repo
      let hasMoreFailures = true;
      while (hasMoreFailures) {
        // Wait if merge lock is active
        while (mergeLockActive) {
          worker.status = "waiting";
          renderDashboard(dashboard);
          await new Promise((r) => setTimeout(r, 1000));
        }

        worker.status = "running";
        renderDashboard(dashboard);

        const result = await spawnRunTs(refactoring, repo.name, triedSetFile, worktreePath);

        if (result.code === 0) {
          // Clean exit — no failures, move to next repo
          hasMoreFailures = false;
          try {
            const parsed = JSON.parse(result.stdout.trim().split("\n").pop() ?? "{}");
            worker.candidatesTested += parsed.candidatesTested ?? 0;
          } catch {
            // ignore parse errors
          }
          dashboard.completedPairs++;
        } else {
          // Failure found — parse FailureReport
          let failureReport: FailureReport | null = null;
          try {
            const lastLine = result.stdout.trim().split("\n").pop() ?? "";
            failureReport = JSON.parse(lastLine) as FailureReport;
          } catch {
            process.stderr.write(
              `Failed to parse failure report for ${refactoring}/${repo.name}: ${result.stdout.slice(0, 200)}\n`,
            );
            hasMoreFailures = false;
            continue;
          }

          worker.candidatesTested += failureReport.candidatesTestedSoFar;
          dashboard.errorsFound++;
          renderDashboard(dashboard);

          // Spawn fix agent
          worker.status = "fixing";
          renderDashboard(dashboard);

          const fixResult = await spawnFixAgent(failureReport, worktreePath);

          const finding: Finding = {
            refactoring,
            repo: repo.name,
            repoUrl: repo.url,
            repoRef: repo.ref,
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
          worker.findings.push(finding);

          if (fixResult.success) {
            dashboard.errorsFixed++;
            // Merge fix and rebase other worktrees
            await mergeAndRebase(worker, allWorkers);
            // Continue testing same repo (tried-set ensures no re-draws)
          } else {
            dashboard.errorsUnresolved++;
            // Agent stuck — continue to next candidate (run.ts will skip via tried-set)
          }
        }

        renderDashboard(dashboard);
      }
    }
  } finally {
    worker.status = "done";
    renderDashboard(dashboard);

    // Write findings to disk
    const findingsPath = join(STATE_DIR, `${refactoring}.findings.json`);
    writeFileSync(findingsPath, JSON.stringify(worker.findings, null, 2));

    // Cleanup worktree
    cleanupWorktree(worktreePath, branchName);
  }

  return worker.findings;
}

// --- Dashboard ---

let lastDashboardLines = 0;
let lastDashboardTime = 0;

function renderDashboard(state: DashboardState): void {
  const now = Date.now();
  if (now - lastDashboardTime < 1000) return; // 1-second debounce
  lastDashboardTime = now;

  // Move cursor up to overwrite previous dashboard
  if (lastDashboardLines > 0) {
    process.stderr.write(`\x1b[${lastDashboardLines}A`);
  }

  const lines: string[] = [];

  // Progress bar
  const totalPairs = state.totalRefactorings * state.totalRepos;
  const pct = totalPairs > 0 ? Math.round((state.completedPairs / totalPairs) * 100) : 0;
  const barWidth = 30;
  const filled = Math.round((pct / 100) * barWidth);
  const bar = "█".repeat(filled) + "░".repeat(barWidth - filled);
  lines.push(`[${bar}] ${pct}% (${state.completedPairs}/${totalPairs} pairs)`);

  // Per-worker rows
  for (const worker of state.workers) {
    const statusIcon =
      worker.status === "running"
        ? "▶"
        : worker.status === "fixing"
          ? "🔧"
          : worker.status === "waiting"
            ? "⏸"
            : "✓";
    lines.push(
      `  ${statusIcon} ${worker.refactoring} | ${worker.currentRepo || "-"} | ${worker.candidatesTested} candidates | ${worker.status}`,
    );
  }

  // Summary row
  lines.push(
    `Found: ${state.errorsFound} errors (${state.errorsFixed} fixed, ${state.errorsUnresolved} unresolved)`,
  );
  lines.push(""); // trailing newline

  const output = lines.join("\n");
  process.stderr.write(output);
  lastDashboardLines = lines.length;
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

  // Setup state directories
  mkdirSync(STATE_DIR, { recursive: true });
  mkdirSync(WORKTREES_DIR, { recursive: true });

  // Load refactorings
  process.stderr.write("Loading refactorings...\n");
  const refactorings = loadRefactorings();
  if (refactorings.length === 0) {
    process.stderr.write("No refactorings found.\n");
    process.exit(1);
  }
  process.stderr.write(`${refactorings.length} refactoring(s): ${refactorings.join(", ")}\n`);

  // Get repo list for progress tracking
  const repos = getRepoList();
  const selectedRepos = repoFilter ? repos.filter((r) => repoFilter.includes(r.name)) : repos;
  process.stderr.write(`${selectedRepos.length} repo(s)\n`);
  process.stderr.write(`Workers: ${maxWorkers}, Max applies: ${maxApplies}\n\n`);

  // Dashboard state
  const dashboard: DashboardState = {
    workers: [],
    totalRefactorings: refactorings.length,
    totalRepos: selectedRepos.length,
    completedPairs: 0,
    errorsFound: 0,
    errorsFixed: 0,
    errorsUnresolved: 0,
  };

  // Worker pool
  const allWorkers: WorkerState[] = [];
  dashboard.workers = allWorkers;
  const queue = [...refactorings];
  const activeWorkers: Promise<Finding[]>[] = [];
  const allFindings: Finding[] = [];

  async function startNextWorker(): Promise<void> {
    const refactoring = queue.shift();
    if (!refactoring) return;

    const workerPromise = runWorker(refactoring, selectedRepos, allWorkers, dashboard);
    activeWorkers.push(workerPromise);

    workerPromise.then((findings) => {
      allFindings.push(...findings);
      // Remove from active pool
      const idx = activeWorkers.indexOf(workerPromise);
      if (idx >= 0) activeWorkers.splice(idx, 1);
    });
  }

  // Fill initial pool
  const initialCount = Math.min(maxWorkers, refactorings.length);
  for (let i = 0; i < initialCount; i++) {
    await startNextWorker();
  }

  // Wait for workers, starting new ones as slots open
  while (activeWorkers.length > 0 || queue.length > 0) {
    if (activeWorkers.length > 0) {
      await Promise.race(activeWorkers);
    }
    // Start new workers to fill pool
    while (activeWorkers.length < maxWorkers && queue.length > 0) {
      await startNextWorker();
    }
  }

  // Collect any remaining findings from disk
  const findingsFiles = readdirSync(STATE_DIR).filter((f) => f.endsWith(".findings.json"));
  for (const file of findingsFiles) {
    try {
      const content = readFileSync(join(STATE_DIR, file), "utf8");
      const findings = JSON.parse(content) as Finding[];
      // Deduplicate (in-memory findings already collected)
      for (const f of findings) {
        if (
          !allFindings.some(
            (af) => af.commitHash === f.commitHash && af.candidate.target === f.candidate.target,
          )
        ) {
          allFindings.push(f);
        }
      }
    } catch {
      // ignore
    }
  }

  // Print final summary to stderr
  printFinalSummary(dashboard, allFindings, refactorings);

  // Generate and write findings report
  const totalCandidates = allWorkers.reduce((sum, w) => sum + w.candidatesTested, 0);
  const report = generateFindingsReport(allFindings, totalCandidates);

  const reportDir = join(ROOT, "tmp/auto-fix-loop");
  mkdirSync(reportDir, { recursive: true });
  const reportPath = join(reportDir, "findings-report.md");
  writeFileSync(reportPath, report);
  process.stderr.write(`\nReport written to: ${reportPath}\n`);

  // Print report to stdout
  process.stdout.write(report);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    process.stderr.write(`Fatal: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  });
