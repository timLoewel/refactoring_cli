import { spawnSync } from "child_process";
import { existsSync, mkdirSync, readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { Project } from "ts-morph";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "../..");
const CLI = join(ROOT, "src/core/cli/index.ts");
const TSX = join(ROOT, "node_modules/.bin/tsx");

// Pinned TypeORM release
const TYPEORM_REF = "0.3.20";
const TYPEORM_URL = "https://github.com/typeorm/typeorm.git";
const CACHE_DIR = join(ROOT, "tmp", "real-codebase", `typeorm-${TYPEORM_REF}`);

// --- Arg parsing ---
const scriptArgs = process.argv.slice(2);
const isDryRun = scriptArgs.includes("--dry-run");
const isJson = scriptArgs.includes("--json");
// --verbose: print each candidate attempt including skips (default: only print targets + failures)
const isVerbose = scriptArgs.includes("--verbose");
const refactoringFilter = ((): string | undefined => {
  const idx = scriptArgs.indexOf("--refactoring");
  return idx >= 0 ? scriptArgs[idx + 1] : undefined;
})();

// --max-candidates N: stop after N valid (applied) candidates per refactoring
const maxCandidates = ((): number | undefined => {
  const idx = scriptArgs.indexOf("--max-candidates");
  return idx >= 0 ? parseInt(scriptArgs[idx + 1], 10) : undefined;
})();

// --- Seeded LCG ---
function makeLCG(seed = 42): () => number {
  let s = seed;
  return (): number => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0x100000000;
  };
}

/**
 * Weighted shuffle using the exponential-key trick:
 *   key[i] = U[i]^(1/weight[i])   (U uniform in (0,1))
 * Sort descending → items with higher weight appear earlier on average.
 * Produces a proper weighted random permutation (no double-draws).
 * weightFn returns a positive number; items with weight 0 are treated as 1.
 */
function weightedShuffle<T>(arr: T[], weightFn: (item: T) => number, seed = 42): T[] {
  const rng = makeLCG(seed);
  return arr
    .map((item) => {
      const w = Math.max(weightFn(item), 1e-10);
      const u = Math.max(rng(), 1e-300);
      return { item, key: Math.pow(u, 1 / w) };
    })
    .sort((a, b) => b.key - a.key)
    .map(({ item }) => item);
}

// --- Helpers ---
function runShell(cmd: string, cwd?: string): { stdout: string; stderr: string; code: number } {
  const result = spawnSync(cmd, {
    shell: true,
    cwd,
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });
  return { stdout: result.stdout ?? "", stderr: result.stderr ?? "", code: result.status ?? 1 };
}

interface CLIResult {
  success: boolean;
  data: unknown;
  errors?: string[];
}

function runCLI(
  cliArgs: string[],
  projectDir?: string,
): { ok: true; output: CLIResult } | { ok: false; error: string } {
  const extraArgs = projectDir ? ["--path", projectDir] : [];
  const result = spawnSync(TSX, [CLI, "--json", ...extraArgs, ...cliArgs], {
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });
  try {
    const parsed = JSON.parse(result.stdout) as CLIResult;
    return { ok: true, output: parsed };
  } catch {
    const detail = (result.stderr ?? "").trim() || (result.stdout ?? "").trim() || "no output";
    return { ok: false, error: `CLI exited ${result.status ?? "?"}: ${detail.slice(0, 300)}` };
  }
}

// --- Step 2: Clone and cache ---
function ensureCloned(): void {
  const nodeModulesPresent = existsSync(join(CACHE_DIR, "node_modules"));

  if (existsSync(CACHE_DIR) && existsSync(join(CACHE_DIR, "tsconfig.json")) && nodeModulesPresent) {
    process.stderr.write(`Using cached repo: ${CACHE_DIR}\n`);
    return;
  }

  if (!existsSync(CACHE_DIR)) {
    process.stderr.write(`Cloning typeorm@${TYPEORM_REF}...\n`);
    mkdirSync(join(ROOT, "tmp", "real-codebase"), { recursive: true });
    const result = runShell(
      `git clone --depth 1 --branch ${TYPEORM_REF} ${TYPEORM_URL} "${CACHE_DIR}"`,
    );
    if (result.code !== 0) {
      process.stderr.write(`Clone failed:\n${result.stderr}\n`);
      process.exit(1);
    }
    if (!existsSync(join(CACHE_DIR, "tsconfig.json"))) {
      process.stderr.write(`Cloned repo has no tsconfig.json — aborting.\n`);
      process.exit(1);
    }
  }

  if (!nodeModulesPresent) {
    process.stderr.write(`Installing TypeORM dependencies...\n`);
    const result = runShell("npm install --ignore-scripts", CACHE_DIR);
    if (result.code !== 0) {
      process.stderr.write(`npm install failed:\n${result.stderr}\n`);
      process.exit(1);
    }
  }
}

// --- Step 3: Baseline verification ---
function checkBaseline(): void {
  process.stderr.write("Verifying baseline compilation...\n");
  const tsc = join(CACHE_DIR, "node_modules/.bin/tsc");
  const result = runShell(`"${tsc}" --noEmit`, CACHE_DIR);
  if (result.code !== 0) {
    process.stderr.write(
      `Baseline compilation failed — cannot run tests.\n\n${result.stdout}\n${result.stderr}\n`,
    );
    process.exit(1);
  }
  process.stderr.write("Baseline OK.\n");
}

// --- Step 4: Load TypeScript refactorings ---
interface ParamDef {
  name: string;
  type: string;
  required: boolean;
}

interface RefactoringInfo {
  name: string;
  kebabName: string;
  params: ParamDef[];
}

function loadRefactorings(): RefactoringInfo[] {
  const listOut = runCLI(["list"]);
  if (!listOut.ok || !listOut.output.success) {
    process.stderr.write(`Failed to load refactoring list: ${listOut.ok ? "" : listOut.error}\n`);
    process.exit(1);
  }

  interface ListEntry {
    name: string;
    kebabName: string;
  }
  const all = (listOut.output.data as { refactorings: ListEntry[] }).refactorings;

  const tsOnly = all.filter(
    (r) =>
      !r.kebabName.endsWith("-python") && (!refactoringFilter || r.kebabName === refactoringFilter),
  );

  if (refactoringFilter && tsOnly.length === 0) {
    process.stderr.write(`Unknown refactoring: ${refactoringFilter}\n`);
    process.exit(1);
  }

  const results: RefactoringInfo[] = [];
  for (const r of tsOnly) {
    const descOut = runCLI(["describe", r.kebabName]);
    if (!descOut.ok || !descOut.output.success) continue;
    const data = descOut.output.data as { params: ParamDef[] };
    results.push({ name: r.name, kebabName: r.kebabName, params: data.params });
  }
  return results;
}

// --- Symbol enumeration (outside the CLI — test infrastructure only) ---
interface Candidate {
  file: string;
  target: string;
}

interface EnumerationResult {
  candidates: Candidate[];
  reverseImportMap: Map<string, Set<string>>;
  project: Project;
}

function enumerateCandidates(projectDir: string): EnumerationResult {
  const project = new Project({ tsConfigFilePath: join(projectDir, "tsconfig.json") });
  const candidates: Candidate[] = [];
  const reverseImportMap = new Map<string, Set<string>>();

  for (const sf of project.getSourceFiles()) {
    const filePath = sf.getFilePath();

    for (const decl of sf.getVariableDeclarations()) {
      const name = decl.getName();
      if (name) candidates.push({ file: filePath, target: name });
    }

    for (const fn of sf.getFunctions()) {
      const name = fn.getName();
      if (name) candidates.push({ file: filePath, target: name });
    }

    for (const cls of sf.getClasses()) {
      const name = cls.getName();
      if (name) {
        candidates.push({ file: filePath, target: name });
        for (const method of cls.getMethods()) {
          candidates.push({ file: filePath, target: method.getName() });
        }
        for (const prop of cls.getProperties()) {
          const pname = prop.getName();
          if (pname) candidates.push({ file: filePath, target: pname });
        }
      }
    }

    // Build reverse import map: imported file → set of files that import it
    for (const imp of sf.getImportDeclarations()) {
      const imported = imp.getModuleSpecifierSourceFile();
      if (!imported) continue;
      const importedPath = imported.getFilePath();
      let importers = reverseImportMap.get(importedPath);
      if (!importers) {
        importers = new Set<string>();
        reverseImportMap.set(importedPath, importers);
      }
      importers.add(filePath);
    }
  }

  return { candidates, reverseImportMap, project };
}

// --- Build apply params ---
function buildApplyParams(
  refactoring: RefactoringInfo,
  file: string,
  target: string,
): Record<string, unknown> {
  const params: Record<string, unknown> = {};

  // Parse structured target: "startLine-endLine" for line-range refactorings
  const rangeMatch = target.match(/^(\d+)-(\d+)$/);

  for (const p of refactoring.params) {
    if (!p.required) continue;
    if (p.name === "file") {
      params["file"] = file;
    } else if (p.name === "target") {
      params["target"] = target;
    } else if (p.name === "startLine" && rangeMatch) {
      params["startLine"] = parseInt(rangeMatch[1] as string, 10);
    } else if (p.name === "endLine" && rangeMatch) {
      params["endLine"] = parseInt(rangeMatch[2] as string, 10);
    } else if (p.type === "number") {
      params[p.name] = 0;
    } else if (p.name.toLowerCase().endsWith("type") || p.name.toLowerCase() === "typename") {
      // Use a valid TS type so refactorings that insert type annotations pass tsc
      params[p.name] = "unknown";
    } else {
      params[p.name] = "__reftest__";
    }
  }
  return params;
}

// --- Step 5: Apply in-place with git rollback ---
interface CandidateResult {
  /** true if preconditions passed and apply was attempted */
  isTarget: boolean;
  applied: boolean;
  passed: boolean;
  error: string | null;
  /** reason the candidate was skipped (only set when isTarget=false) */
  skipReason: string | null;
  /** unified diff of the change (only set when applied) */
  diff: string | null;
  params: Record<string, unknown>;
  applyMs: number;
  tscMs: number;
  rollbackMs: number;
  scopeFileCount: number;
}

interface ApplyResult {
  success: boolean;
  filesChanged: string[];
  description: string;
}

function gitRollback(cwd: string): void {
  runShell("git checkout .", cwd);
}

function gitDiff(cwd: string): string {
  return runShell("git diff", cwd).stdout;
}

async function applyAndCheck(
  client: {
    apply(name: string, params: Record<string, unknown>): Promise<ApplyResult>;
    refresh(files: string[]): Promise<void>;
  },
  refactoring: RefactoringInfo,
  candidate: Candidate,
  reverseImportMap: Map<string, Set<string>>,
  tsProject: Project,
  baselineCache: { baselined: Set<string>; keys: Set<string> },
): Promise<CandidateResult> {
  const params = buildApplyParams(refactoring, candidate.file, candidate.target);
  const noResult = (skipReason: string | null): CandidateResult => ({
    isTarget: false,
    applied: false,
    passed: false,
    error: null,
    skipReason,
    diff: null,
    params,
    applyMs: 0,
    tscMs: 0,
    rollbackMs: 0,
    scopeFileCount: 0,
  });
  const failResult = (error: string | null, applyMs = 0): CandidateResult => ({
    isTarget: true,
    applied: false,
    passed: false,
    error,
    skipReason: null,
    diff: null,
    params,
    applyMs,
    tscMs: 0,
    rollbackMs: 0,
    scopeFileCount: 0,
  });

  const t0 = Date.now();
  let result: ApplyResult;
  try {
    result = await client.apply(refactoring.kebabName, params);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const isPreconditionFailure =
      msg.includes("Precondition failed") || msg.includes("not found") || msg.includes("param '");
    if (isPreconditionFailure) return noResult(msg);
    return failResult(msg, Date.now() - t0);
  }
  const applyMs = Date.now() - t0;

  if (!result.success) {
    const isPreconditionFailure =
      result.description.includes("Precondition failed") ||
      result.description.includes("not found") ||
      result.description.includes("param '");
    if (isPreconditionFailure) return noResult(result.description);
    return failResult(result.description, applyMs);
  }

  // Capture diff before rollback
  const diff = gitDiff(CACHE_DIR);

  // Compile check using in-process ts-morph (avoids per-check tsc process spawn overhead)
  const t1 = Date.now();

  // Scope: changed files + their direct importers (not transitive — avoids project-wide explosion)
  const changedFileSet = new Set(result.filesChanged);
  const scopeSet = new Set<string>(result.filesChanged);
  for (const changedFile of result.filesChanged) {
    for (const importer of reverseImportMap.get(changedFile) ?? []) {
      scopeSet.add(importer);
    }
  }

  // Baseline pre-existing diagnostics for importer files (BEFORE refreshing changed files,
  // so the type checker still has the original versions). Only done once per file.
  for (const filePath of scopeSet) {
    if (changedFileSet.has(filePath) || baselineCache.baselined.has(filePath)) continue;
    baselineCache.baselined.add(filePath);
    const sf = tsProject.getSourceFile(filePath);
    if (!sf) continue;
    for (const d of sf.getPreEmitDiagnostics()) {
      baselineCache.keys.add(`${filePath}:${d.getStart() ?? -1}:${d.getCode()}`);
    }
  }

  // Refresh only the files that were changed. refreshFromFileSystemSync can throw when the
  // AST shape changes too drastically; fall back to remove+re-add in that case.
  for (const changedFile of result.filesChanged) {
    const sf = tsProject.getSourceFile(changedFile);
    if (!sf) continue;
    try {
      sf.refreshFromFileSystemSync();
    } catch {
      tsProject.removeSourceFile(sf);
      tsProject.addSourceFileAtPath(changedFile);
    }
  }

  const scopedFiles = Array.from(scopeSet)
    .map((p) => tsProject.getSourceFile(p))
    .filter((sf): sf is NonNullable<typeof sf> => sf !== undefined);
  // Only count diagnostics that are NEW — filter out pre-existing errors to avoid
  // false failures from pre-existing TypeORM issues in importer files.
  const allDiagnostics = scopedFiles.flatMap((sf) => sf.getPreEmitDiagnostics());
  const diagnostics = allDiagnostics.filter((d) => {
    const diagFile = d.getSourceFile()?.getFilePath();
    if (!diagFile) return true; // keep if no file info
    if (changedFileSet.has(diagFile)) return true; // always keep errors from changed files
    // For importer files: keep only if NOT pre-existing
    const key = `${diagFile}:${d.getStart() ?? -1}:${d.getCode()}`;
    return !baselineCache.keys.has(key);
  });
  const tscMs = Date.now() - t1;

  const passed = diagnostics.length === 0;
  const errorText = passed
    ? null
    : diagnostics
        .slice(0, 10)
        .map((d) => {
          const file = d.getSourceFile();
          const pos = d.getStart();
          const lineCol =
            file && pos !== undefined
              ? ((): string => {
                  const lc = file.getLineAndColumnAtPos(pos);
                  return ` (${file.getBaseName()}:${lc.line}:${lc.column})`;
                })()
              : "";
          const msg = d.getMessageText();
          const msgStr = typeof msg === "string" ? msg : msg.getMessageText();
          return `${msgStr}${lineCol}`;
        })
        .join("\n");

  // Rollback changes and refresh daemon's AST + in-process project
  const t2 = Date.now();
  gitRollback(CACHE_DIR);
  for (const changedFile of result.filesChanged) {
    const sf = tsProject.getSourceFile(changedFile);
    if (!sf) continue;
    try {
      sf.refreshFromFileSystemSync();
    } catch {
      tsProject.removeSourceFile(sf);
      tsProject.addSourceFileAtPath(changedFile);
    }
  }
  await client.refresh(result.filesChanged);
  const rollbackMs = Date.now() - t2;

  return {
    isTarget: true,
    applied: true,
    passed,
    error: errorText,
    skipReason: null,
    diff,
    params,
    applyMs,
    tscMs,
    rollbackMs,
    scopeFileCount: scopedFiles.length,
  };
}

// --- Step 7: Stats ---
interface RefactoringStats {
  refactoring: string;
  targets: number;
  applied: number;
  passed: number;
  failed: number;
  failures: { symbol: string; error: string }[];
}

// --- Cleanup stale test processes ---
function killStaleTestProcesses(): void {
  // Kill any leftover tsx run.ts processes from previous interrupted runs (excluding self)
  const self = process.pid;
  const result = spawnSync(
    "bash",
    ["-c", `pgrep -f 'tsx.*test-real-codebase/run.ts' | grep -v '^${self}$' | xargs -r kill -9`],
    { encoding: "utf8" },
  );
  if (result.status !== 0 && result.stderr?.trim()) {
    // Non-fatal — stale processes might already be gone
  }
}

// --- Main ---
async function main(): Promise<void> {
  killStaleTestProcesses();
  ensureCloned();
  checkBaseline();

  process.stderr.write("Loading refactorings...\n");
  const refactorings = loadRefactorings();
  process.stderr.write(`${refactorings.length} TypeScript refactoring(s) loaded.\n`);

  process.stderr.write("Enumerating candidates...\n");
  const {
    candidates: allCandidates,
    reverseImportMap,
    project: tsProject,
  } = enumerateCandidates(CACHE_DIR);
  // Weighted shuffle: bias toward candidates whose file has FEW importers (small change sets).
  // Most draws come from fast, small-scope files; large-scope files appear occasionally.
  // Weight = 1 / (importerCount + 1)^2 — quadratic inverse skew.
  // Uses the exponential-key trick (weighted random permutation without replacement).
  const shuffledCandidates = weightedShuffle(
    allCandidates,
    (c) => {
      const importerCount = reverseImportMap.get(c.file)?.size ?? 0;
      return 1 / (importerCount + 1) ** 2;
    },
    42,
  );
  process.stderr.write(
    `${shuffledCandidates.length} symbol candidates found (small-scope-biased shuffle, seed=42).${maxCandidates !== undefined ? ` Will stop after ${maxCandidates} valid targets per refactoring.` : ""}\n`,
  );

  // Step 6.1: dry-run — report candidate counts and exit
  if (isDryRun) {
    const rows = refactorings.map((r) => ({
      refactoring: r.kebabName,
      candidates: shuffledCandidates.length,
    }));
    if (isJson) {
      process.stdout.write(JSON.stringify({ dryRun: true, refactorings: rows }, null, 2) + "\n");
    } else {
      for (const row of rows) {
        process.stdout.write(`${row.refactoring}: ${row.candidates} symbols to try\n`);
      }
    }
    return;
  }

  // Start daemon for the cached TypeORM project
  process.stderr.write("Starting refactoring daemon...\n");
  const { RefactorClient } = await import("../../src/core/refactor-client.js");
  const { startDaemon } = await import("../../src/core/server/daemon.js");
  // Import registry after all refactoring modules have been loaded (side-effects register them)
  await import("../../src/refactorings/register-all.js");
  const { registry } = await import("../../src/core/refactoring-registry.js");
  await startDaemon(CACHE_DIR);
  const client = await RefactorClient.connect(CACHE_DIR);
  process.stderr.write("Daemon ready.\n");

  // Cache pre-existing diagnostics for importer files to filter out false positives
  const baselineCache = { baselined: new Set<string>(), keys: new Set<string>() };

  const stats: RefactoringStats[] = [];

  for (const refactoring of refactorings) {
    const stat: RefactoringStats = {
      refactoring: refactoring.kebabName,
      targets: 0,
      applied: 0,
      passed: 0,
      failed: 0,
      failures: [],
    };

    const limit = maxCandidates ?? shuffledCandidates.length;

    // Use refactoring-specific enumerate when available; fall back to generic symbol list.
    const definition = registry.lookup(refactoring.kebabName);
    const candidateList: Candidate[] = definition?.enumerate
      ? weightedShuffle(
          definition.enumerate(tsProject),
          (c) => {
            const importerCount = reverseImportMap.get(c.file)?.size ?? 0;
            return 1 / (importerCount + 1) ** 2;
          },
          42,
        )
      : shuffledCandidates;
    const source = definition?.enumerate ? "enumerate" : "generic";
    process.stderr.write(
      `\nTesting: ${refactoring.kebabName} (up to ${limit} valid targets from ${candidateList.length} candidates [${source}])\n`,
    );

    // Track skip reasons for summary
    const skipReasonCounts = new Map<string, number>();
    // Sample of skipped candidates for LLM review (first occurrence per unique reason)
    const skipSamples: { reason: string; candidate: Candidate; source: string }[] = [];

    let checked = 0;
    for (const candidate of candidateList) {
      const shortFile = candidate.file.replace(CACHE_DIR + "/", "");

      if (isVerbose) {
        process.stderr.write(
          `  → ${refactoring.kebabName}  target="${candidate.target}"  file=${shortFile}\n`,
        );
      }

      // Capture file content before applying (used for context on failures)
      let beforeContent = "";
      try {
        beforeContent = readFileSync(candidate.file, "utf8");
      } catch {
        /* ignore */
      }

      const result = await applyAndCheck(
        client,
        refactoring,
        candidate,
        reverseImportMap,
        tsProject,
        baselineCache,
      );
      checked++;

      if (!result.isTarget) {
        // Normalize skip reason to a category key for aggregation
        const rawReason = result.skipReason ?? "precondition failed";
        const reasonKey = rawReason
          .replace(/'[^']+'/g, "'<name>'") // normalize symbol names
          .replace(/\d+/g, "N"); // normalize numbers
        const prev = skipReasonCounts.get(reasonKey) ?? 0;
        skipReasonCounts.set(reasonKey, prev + 1);
        // Keep first occurrence per reason category for sample review
        if (prev === 0) {
          skipSamples.push({ reason: rawReason, candidate, source: beforeContent });
        }
        if (isVerbose) {
          process.stderr.write(`    (skip: ${rawReason})\n`);
        }
        continue;
      }

      stat.targets++;
      const label = `[${stat.targets}/${limit}]`;

      if (result.applied) {
        stat.applied++;
        const timing = `apply=${result.applyMs}ms  typecheck=${result.tscMs}ms (${result.scopeFileCount} files)  rollback=${result.rollbackMs}ms`;
        if (result.passed) {
          stat.passed++;
          process.stderr.write(
            `  ${label} ✓ ${candidate.target} (${shortFile}) — tsc passed  [${timing}]\n`,
          );
        } else {
          stat.failed++;
          process.stderr.write(
            `  ${label} ✗ ${candidate.target} (${shortFile}) — tsc failed  [${timing}]\n`,
          );
          process.stderr.write(`    params: ${JSON.stringify(result.params)}\n`);
          // Source context around target
          const lines = beforeContent.split("\n");
          const targetLineIdx = lines.findIndex((l) => l.includes(candidate.target));
          if (targetLineIdx >= 0) {
            const start = Math.max(0, targetLineIdx - 3);
            const end = Math.min(lines.length, targetLineIdx + 8);
            process.stderr.write(`    source before (${shortFile} lines ${start + 1}-${end}):\n`);
            for (let i = start; i < end; i++) {
              process.stderr.write(`      ${i + 1}: ${lines[i]}\n`);
            }
          }
          if (result.diff) {
            process.stderr.write(`    diff:\n`);
            for (const line of result.diff.split("\n").slice(0, 100)) {
              process.stderr.write(`      ${line}\n`);
            }
          }
          if (result.error) {
            process.stderr.write(`    compiler errors:\n`);
            for (const line of result.error.split("\n")) {
              process.stderr.write(`      ${line}\n`);
            }
            stat.failures.push({
              symbol: `${candidate.file}::${candidate.target}`,
              error: result.error,
            });
          }
        }
      } else {
        // Daemon error or non-precondition apply failure
        stat.failed++;
        process.stderr.write(`  ${label} ✗ ${candidate.target} (${shortFile}) — apply failed\n`);
        if (result.error) {
          process.stderr.write(`    params: ${JSON.stringify(result.params)}\n`);
          process.stderr.write(`    error: ${result.error}\n`);
          // Show the relevant section of the source file for context
          const lines = beforeContent.split("\n");
          const targetLineIdx = lines.findIndex((l) => l.includes(candidate.target));
          if (targetLineIdx >= 0) {
            const start = Math.max(0, targetLineIdx - 3);
            const end = Math.min(lines.length, targetLineIdx + 8);
            process.stderr.write(`    source (lines ${start + 1}-${end}):\n`);
            for (let i = start; i < end; i++) {
              process.stderr.write(`      ${i + 1}: ${lines[i]}\n`);
            }
          }
          stat.failures.push({
            symbol: `${candidate.file}::${candidate.target}`,
            error: result.error,
          });
        }
      }

      // Stop once we've collected enough valid targets, or after a reasonable scan budget
      // (20× the target limit) to avoid iterating the entire corpus for rare refactorings.
      if (stat.targets >= limit) break;
      if (maxCandidates !== undefined && checked >= limit * 20) break;
    }

    process.stderr.write(
      `  Summary: checked=${checked}, targets=${stat.targets}, passed=${stat.passed}, failed=${stat.failed}\n`,
    );

    // Print skip reason breakdown
    if (skipReasonCounts.size > 0) {
      const sortedReasons = [...skipReasonCounts.entries()].sort((a, b) => b[1] - a[1]);
      process.stderr.write(`  Skip reasons (${checked - stat.targets} skipped):\n`);
      for (const [reason, count] of sortedReasons.slice(0, 5)) {
        process.stderr.write(`    ${count}x  ${reason}\n`);
      }
      // Print samples for LLM review
      process.stderr.write(`  Sample skipped candidates (for review):\n`);
      for (const sample of skipSamples.slice(0, 5)) {
        const shortFile = sample.candidate.file.replace(CACHE_DIR + "/", "");
        process.stderr.write(
          `    [${sample.candidate.target} in ${shortFile}] reason: ${sample.reason}\n`,
        );
        const lines = sample.source.split("\n");
        const targetLineIdx = lines.findIndex((l) => l.includes(sample.candidate.target));
        if (targetLineIdx >= 0) {
          const start = Math.max(0, targetLineIdx - 2);
          const end = Math.min(lines.length, targetLineIdx + 5);
          for (let i = start; i < end; i++) {
            process.stderr.write(`      ${i + 1}: ${lines[i]}\n`);
          }
        }
      }
    }

    stats.push(stat);
  }

  await client.close();

  // Step 7.2 / 7.3: summary
  if (isJson) {
    process.stdout.write(JSON.stringify(stats, null, 2) + "\n");
    return;
  }

  // Text table
  const headers = ["Refactoring", "Targets", "Applied", "Passed", "Failed"];
  const rows = stats.map((s) => [
    s.refactoring,
    String(s.targets),
    String(s.applied),
    String(s.passed),
    String(s.failed),
  ]);
  const widths = headers.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
  const fmt = (row: string[]): string => row.map((cell, i) => cell.padEnd(widths[i])).join("  ");

  process.stdout.write(fmt(headers) + "\n");
  process.stdout.write(widths.map((w) => "-".repeat(w)).join("  ") + "\n");
  for (const row of rows) process.stdout.write(fmt(row) + "\n");
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
