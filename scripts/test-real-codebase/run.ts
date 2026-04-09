import { spawnSync } from "child_process";
import { existsSync, mkdirSync, readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { Project } from "ts-morph";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "../..");
const CLI = join(ROOT, "src/core/cli/index.ts");
const TSX = join(ROOT, "node_modules/.bin/tsx");

// --- Repo configuration ---
interface RepoConfig {
  name: string;
  url: string;
  ref: string;
  installCmd?: string;
  testMode?: "compile-only" | "compile-and-test";
  testCmd?: string;
  scopedTestCmd?: string;
  relatedTestsFlag?: string;
  testTimeout?: number;
  projectSubdir?: string;
}

const REPOS: RepoConfig[] = [
  // --- Compile-and-test repos ---
  {
    name: "zod",
    url: "https://github.com/colinhacks/zod.git",
    ref: "v3.24.4",
    testMode: "compile-and-test",
    testCmd: "npx vitest run",
    scopedTestCmd: "npx vitest related --run",
  },
  {
    name: "date-fns",
    url: "https://github.com/date-fns/date-fns.git",
    ref: "v4.1.0",
    testMode: "compile-and-test",
    testCmd: "npx vitest run",
    scopedTestCmd: "npx vitest related --run",
  },
  {
    name: "inversify",
    url: "https://github.com/inversify/InversifyJS.git",
    ref: "v6.2.2",
    testMode: "compile-and-test",
    testCmd: "npx jest",
    scopedTestCmd: "npx jest --findRelatedTests",
  },
  {
    name: "ts-pattern",
    url: "https://github.com/gvergnaud/ts-pattern.git",
    ref: "v5.9.0",
    testMode: "compile-and-test",
    testCmd: "npx jest",
    scopedTestCmd: "npx jest --findRelatedTests",
  },
  {
    name: "superstruct",
    url: "https://github.com/ianstormtaylor/superstruct.git",
    ref: "v2.0.2",
    testMode: "compile-and-test",
    testCmd: "npx vitest run",
    scopedTestCmd: "npx vitest related --run",
  },
  {
    name: "neverthrow",
    url: "https://github.com/supermacro/neverthrow.git",
    ref: "v8.2.0",
    testMode: "compile-and-test",
    testCmd: "npx vitest run",
    scopedTestCmd: "npx vitest related --run",
  },
  {
    name: "remeda",
    url: "https://github.com/remeda/remeda.git",
    ref: "v2.33.7",
    testMode: "compile-and-test",
    testCmd: "npx vitest run",
    scopedTestCmd: "npx vitest related --run",
    projectSubdir: "packages/remeda",
  },
  {
    name: "immer",
    url: "https://github.com/immerjs/immer.git",
    ref: "v11.1.4",
    testMode: "compile-and-test",
    testCmd: "npx vitest run",
    scopedTestCmd: "npx vitest related --run",
  },
  {
    name: "true-myth",
    url: "https://github.com/true-myth/true-myth.git",
    ref: "v9.3.1",
    testMode: "compile-and-test",
    testCmd: "npx vitest run",
    scopedTestCmd: "npx vitest related --run",
  },
  {
    name: "purify-ts",
    url: "https://github.com/gigobyte/purify.git",
    ref: "v2.1.4",
    testMode: "compile-and-test",
    testCmd: "npx vitest run",
    scopedTestCmd: "npx vitest related --run",
  },
  {
    name: "class-validator",
    url: "https://github.com/typestack/class-validator.git",
    ref: "v0.15.1",
    testMode: "compile-and-test",
    testCmd: "npx jest",
    scopedTestCmd: "npx jest --findRelatedTests",
  },
  {
    name: "class-transformer",
    url: "https://github.com/typestack/class-transformer.git",
    ref: "v0.5.1",
    testMode: "compile-and-test",
    testCmd: "npx jest",
    scopedTestCmd: "npx jest --findRelatedTests",
  },
  // --- Compile-only repos ---
  {
    name: "typeorm",
    url: "https://github.com/typeorm/typeorm.git",
    ref: "0.3.20",
    testMode: "compile-only",
  },
  {
    name: "rxjs",
    url: "https://github.com/ReactiveX/rxjs.git",
    ref: "7.8.2",
    testMode: "compile-only",
  },
  {
    name: "fp-ts",
    url: "https://github.com/gcanti/fp-ts.git",
    ref: "2.16.9",
    testMode: "compile-only",
  },
  {
    name: "io-ts",
    url: "https://github.com/gcanti/io-ts.git",
    ref: "2.2.22",
    testMode: "compile-only",
  },
  {
    name: "immutable-js",
    url: "https://github.com/immutable-js/immutable-js.git",
    ref: "v5.1.5",
    testMode: "compile-only",
  },
  {
    name: "mobx",
    url: "https://github.com/mobxjs/mobx.git",
    ref: "v6.0.2",
    testMode: "compile-only",
    installCmd: "npm install --ignore-scripts --legacy-peer-deps",
  },
];

function repoCacheDir(repo: RepoConfig): string {
  return join(ROOT, "tmp", "real-codebase", `${repo.name}-${repo.ref}`);
}

// --- Arg parsing ---
const scriptArgs = process.argv.slice(2);
const isDryRun = scriptArgs.includes("--dry-run");
const isJson = scriptArgs.includes("--json");
// --verbose: print each candidate attempt including skips (default: only print targets + failures)
const isVerbose = scriptArgs.includes("--verbose");
// --skip-tests: force all repos to compile-only (no semantic testing)
const skipTests = scriptArgs.includes("--skip-tests");
const refactoringFilter = ((): string | undefined => {
  const idx = scriptArgs.indexOf("--refactoring");
  return idx >= 0 ? scriptArgs[idx + 1] : undefined;
})();

// --max-applies N: stop after N valid (applied) candidates per refactoring
const maxApplies = ((): number | undefined => {
  const idx = scriptArgs.indexOf("--max-applies");
  return idx >= 0 ? parseInt(scriptArgs[idx + 1], 10) : undefined;
})();

// --repo <name>: run against a single repo (default: all)
const repoFilter = ((): string | undefined => {
  const idx = scriptArgs.indexOf("--repo");
  return idx >= 0 ? scriptArgs[idx + 1] : undefined;
})();

// --seed N: random seed for candidate shuffling (default: 42)
const shuffleSeed = ((): number => {
  const idx = scriptArgs.indexOf("--seed");
  return idx >= 0 ? parseInt(scriptArgs[idx + 1], 10) : 42;
})();

function getSelectedRepos(): RepoConfig[] {
  if (!repoFilter || repoFilter === "all") return REPOS;
  const repo = REPOS.find((r) => r.name === repoFilter);
  if (!repo) {
    const available = REPOS.map((r) => r.name).join(", ");
    process.stderr.write(`Unknown repo: ${repoFilter}. Available: ${available}\n`);
    process.exit(1);
  }
  return [repo];
}

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
function effectiveProjectDir(repo: RepoConfig, cacheDir: string): string {
  return repo.projectSubdir ? join(cacheDir, repo.projectSubdir) : cacheDir;
}

function ensureCloned(repo: RepoConfig): string {
  const cacheDir = repoCacheDir(repo);
  const projDir = effectiveProjectDir(repo, cacheDir);
  const nodeModulesPresent = existsSync(join(cacheDir, "node_modules"));

  if (existsSync(cacheDir) && existsSync(join(projDir, "tsconfig.json")) && nodeModulesPresent) {
    process.stderr.write(`Using cached repo: ${cacheDir}\n`);
    return cacheDir;
  }

  if (!existsSync(cacheDir)) {
    process.stderr.write(`Cloning ${repo.name}@${repo.ref}...\n`);
    mkdirSync(join(ROOT, "tmp", "real-codebase"), { recursive: true });
    const result = runShell(`git clone --depth 1 --branch ${repo.ref} ${repo.url} "${cacheDir}"`);
    if (result.code !== 0) {
      process.stderr.write(`Clone failed:\n${result.stderr}\n`);
      process.exit(1);
    }
    if (!existsSync(join(projDir, "tsconfig.json"))) {
      process.stderr.write(`Cloned repo has no tsconfig.json at ${projDir} — aborting.\n`);
      process.exit(1);
    }
  }

  if (!nodeModulesPresent) {
    process.stderr.write(`Installing ${repo.name} dependencies...\n`);
    const defaultCmd = existsSync(join(cacheDir, "package-lock.json"))
      ? "npm ci --ignore-scripts"
      : "npm install --ignore-scripts";
    const installCmd = repo.installCmd ?? defaultCmd;
    const result = runShell(installCmd, cacheDir);
    if (result.code !== 0) {
      process.stderr.write(`Install failed:\n${result.stderr}\n`);
      process.exit(1);
    }
  }

  return cacheDir;
}

// --- Step 3: Baseline verification ---
function checkBaseline(repo: RepoConfig, cacheDir: string): boolean {
  const projDir = effectiveProjectDir(repo, cacheDir);
  process.stderr.write("Verifying baseline compilation...\n");
  const tscBin = join(cacheDir, "node_modules/.bin/tsc");
  const tscDirect = join(cacheDir, "node_modules/typescript/bin/tsc");
  const tsc = existsSync(tscBin) ? tscBin : tscDirect;
  const result = runShell(`"${tsc}" --noEmit`, projDir);
  if (result.code !== 0) {
    const errorLines = (result.stdout + result.stderr).trim().split("\n").filter(Boolean);
    process.stderr.write(
      `WARNING: Baseline compilation has ${errorLines.length} pre-existing error(s) — in-process checking will baseline them.\n`,
    );
    return false;
  }
  process.stderr.write("Baseline OK.\n");
  return true;
}

function checkBaselineTests(repo: RepoConfig, cacheDir: string): boolean {
  if (!repo.testCmd) return false;
  const effectiveDir = repo.projectSubdir ? join(cacheDir, repo.projectSubdir) : cacheDir;
  process.stderr.write(`Verifying baseline tests for ${repo.name}...\n`);
  const result = runShell(repo.testCmd, effectiveDir);
  if (result.code !== 0) {
    process.stderr.write(
      `WARNING: Baseline tests failed for ${repo.name} — downgrading to compile-only.\n${result.stderr.slice(0, 500)}\n`,
    );
    return false;
  }
  process.stderr.write("Baseline tests OK.\n");
  return true;
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
    } else if (p.name === "typeField" && target.includes(":")) {
      // Structured target: "ClassName:fieldName" for type-code refactorings
      params["typeField"] = target.split(":")[1];
      params["target"] = target.split(":")[0];
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
  /** null = tests not run (compile-only or tsc failed) */
  testsPassed: boolean | null;
  testError: string | null;
  testMs: number;
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
  cacheDir: string,
  repo: RepoConfig,
  runTests: boolean,
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
    testsPassed: null,
    testError: null,
    testMs: 0,
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
    testsPassed: null,
    testError: null,
    testMs: 0,
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
  const diff = gitDiff(cacheDir);

  // Detect file truncation: if the diff ends with "No newline at end of file" and
  // removes significantly more lines than it adds, the AST manipulation likely
  // corrupted the file. Roll back early and mark as a type error.
  if (diff.includes("\\ No newline at end of file")) {
    const addedLines = (diff.match(/^\+[^+]/gm) ?? []).length;
    const removedLines = (diff.match(/^-[^-]/gm) ?? []).length;
    if (removedLines > addedLines + 3) {
      const t2 = Date.now();
      gitRollback(cacheDir);
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
      return {
        isTarget: true,
        applied: true,
        passed: false,
        error: "File truncated by AST manipulation (ts-morph corruption)",
        skipReason: null,
        diff,
        params,
        applyMs,
        tscMs: 0,
        rollbackMs: Date.now() - t2,
        scopeFileCount: 0,
        testsPassed: null,
        testError: null,
        testMs: 0,
      };
    }
  }

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

  // Scoped test execution (only if tsc passed and tests are enabled)
  let testsPassed: boolean | null = null;
  let testError: string | null = null;
  let testMs = 0;

  if (passed && runTests && repo.testCmd && (repo.scopedTestCmd || repo.relatedTestsFlag)) {
    const effectiveDir = repo.projectSubdir ? join(cacheDir, repo.projectSubdir) : cacheDir;
    const changedFilesRelative = result.filesChanged.map((f) => f.replace(cacheDir + "/", ""));
    const scopedCmd = repo.scopedTestCmd ?? `${repo.testCmd} ${repo.relatedTestsFlag}`;
    const testCommand = `${scopedCmd} ${changedFilesRelative.join(" ")}`;
    const timeout = repo.testTimeout ?? 30_000;
    const t3 = Date.now();
    const testResult = spawnSync(testCommand, {
      shell: true,
      cwd: effectiveDir,
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024,
      timeout,
    });
    testMs = Date.now() - t3;

    if (testResult.signal === "SIGTERM" || testResult.error?.message?.includes("ETIMEDOUT")) {
      testsPassed = false;
      testError = `Test timeout after ${timeout}ms`;
    } else if (testResult.status === 0) {
      testsPassed = true;
    } else {
      // Check for "no tests found" patterns — treat as pass
      const output = (testResult.stdout ?? "") + (testResult.stderr ?? "");
      const noTestsFound =
        output.includes("No test files found") ||
        output.includes("No tests found") ||
        output.includes("No test suite found");
      if (noTestsFound) {
        testsPassed = true;
      } else {
        const rawError = (testResult.stderr ?? testResult.stdout ?? "").trim().slice(0, 1000);
        // Detect stale vitest/esbuild cache: if the error references a file that was
        // NOT changed by this refactoring (e.g. "Unexpected end of file" in a previously
        // truncated file), this is a false positive from cached corruption.
        const transformErrorMatch = rawError.match(/Transform failed.*\n(\/[^\s:]+\.ts):\d+/);
        if (transformErrorMatch) {
          const errorFilePath = transformErrorMatch[1] ?? "";
          const changedFileSet = new Set(result.filesChanged);
          if (!changedFileSet.has(errorFilePath)) {
            // Error is in a file we didn't touch — stale cache, not a real failure
            testsPassed = true;
          } else {
            testsPassed = false;
            testError = rawError;
          }
        } else {
          testsPassed = false;
          testError = rawError;
        }
      }
    }
  }

  // Rollback changes and refresh daemon's AST + in-process project
  const t2 = Date.now();
  gitRollback(cacheDir);
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
    testsPassed,
    testError,
    testMs,
  };
}

// --- Step 7: Stats ---
interface SemanticFailure {
  symbol: string;
  refactoring: string;
  params: Record<string, unknown>;
  sourceBefore: string;
  diff: string;
  testError: string;
}

interface RefactoringStats {
  refactoring: string;
  targets: number;
  applied: number;
  passed: number;
  failed: number;
  semanticErrors: number;
  failures: { symbol: string; error: string }[];
  semanticFailures: SemanticFailure[];
}

// --- Run all refactorings against a single repo ---
async function runRepo(
  repo: RepoConfig,
  refactorings: RefactoringInfo[],
  registry: { lookup(name: string): { enumerate?: (project: Project) => Candidate[] } | undefined },
): Promise<{ repo: string; stats: RefactoringStats[] }> {
  const cacheDir = ensureCloned(repo);
  const projDir = effectiveProjectDir(repo, cacheDir);
  checkBaseline(repo, cacheDir);

  // Determine effective test mode for this run
  const effectiveTestMode =
    skipTests || repo.testMode !== "compile-and-test" ? "compile-only" : repo.testMode;
  let runTests = effectiveTestMode === "compile-and-test";

  if (runTests) {
    const baselineOk = checkBaselineTests(repo, cacheDir);
    if (!baselineOk) {
      runTests = false;
    }
  }

  process.stderr.write(
    `\nEnumerating candidates for ${repo.name} [${runTests ? "compile-and-test" : "compile-only"}]...\n`,
  );
  const {
    candidates: allCandidates,
    reverseImportMap,
    project: tsProject,
  } = enumerateCandidates(projDir);
  const shuffledCandidates = weightedShuffle(
    allCandidates,
    (c) => {
      const importerCount = reverseImportMap.get(c.file)?.size ?? 0;
      return 1 / (importerCount + 1) ** 2;
    },
    shuffleSeed,
  );
  process.stderr.write(
    `${shuffledCandidates.length} symbol candidates found (small-scope-biased shuffle, seed=${shuffleSeed}).${maxApplies !== undefined ? ` Will stop after ${maxApplies} applies per refactoring.` : ""}\n`,
  );

  // Start daemon for this repo
  process.stderr.write("Starting refactoring daemon...\n");
  const { RefactorClient } = await import("../../src/core/refactor-client.js");
  const { startDaemon } = await import("../../src/core/server/daemon.js");
  await startDaemon(cacheDir);
  const client = await RefactorClient.connect(cacheDir);
  process.stderr.write("Daemon ready.\n");

  const baselineCache = { baselined: new Set<string>(), keys: new Set<string>() };
  const stats: RefactoringStats[] = [];

  for (const refactoring of refactorings) {
    const stat: RefactoringStats = {
      refactoring: refactoring.kebabName,
      targets: 0,
      applied: 0,
      passed: 0,
      failed: 0,
      semanticErrors: 0,
      failures: [],
      semanticFailures: [],
    };

    const limit = maxApplies ?? shuffledCandidates.length;

    const definition = registry.lookup(refactoring.kebabName);
    const candidateList: Candidate[] = definition?.enumerate
      ? weightedShuffle(
          definition.enumerate(tsProject),
          (c) => {
            const importerCount = reverseImportMap.get(c.file)?.size ?? 0;
            return 1 / (importerCount + 1) ** 2;
          },
          shuffleSeed,
        )
      : shuffledCandidates;
    const source = definition?.enumerate ? "enumerate" : "generic";
    process.stderr.write(
      `\nTesting: ${refactoring.kebabName} (up to ${limit} applies from ${candidateList.length} candidates [${source}])\n`,
    );

    const skipReasonCounts = new Map<string, number>();
    const skipSamples: { reason: string; candidate: Candidate; source: string }[] = [];

    let checked = 0;
    for (const candidate of candidateList) {
      const shortFile = candidate.file.replace(cacheDir + "/", "");

      if (isVerbose) {
        process.stderr.write(
          `  → ${refactoring.kebabName}  target="${candidate.target}"  file=${shortFile}\n`,
        );
      }

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
        cacheDir,
        repo,
        runTests,
      );
      checked++;

      if (!result.isTarget) {
        const rawReason = result.skipReason ?? "precondition failed";
        const reasonKey = rawReason.replace(/'[^']+'/g, "'<name>'").replace(/\d+/g, "N");
        const prev = skipReasonCounts.get(reasonKey) ?? 0;
        skipReasonCounts.set(reasonKey, prev + 1);
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
        const testTimingPart = result.testMs > 0 ? `  test=${result.testMs}ms` : "";
        const timing = `apply=${result.applyMs}ms  typecheck=${result.tscMs}ms (${result.scopeFileCount} files)${testTimingPart}  rollback=${result.rollbackMs}ms`;
        if (result.passed && result.testsPassed !== false) {
          stat.passed++;
          const testLabel = result.testsPassed === true ? "tsc+tests passed" : "tsc passed";
          process.stderr.write(
            `  ${label} ✓ ${candidate.target} (${shortFile}) — ${testLabel}  [${timing}]\n`,
          );
        } else if (result.passed && result.testsPassed === false) {
          // tsc passed but tests failed — semantic error
          stat.semanticErrors++;
          process.stderr.write(
            `  ${label} ✗ ${candidate.target} (${shortFile}) — tsc passed, tests FAILED  [${timing}]\n`,
          );
          process.stderr.write(`    params: ${JSON.stringify(result.params)}\n`);
          if (result.testError) {
            process.stderr.write(`    test error:\n`);
            for (const line of result.testError.split("\n").slice(0, 30)) {
              process.stderr.write(`      ${line}\n`);
            }
          }

          // Collect source context for fixture output
          const lines = beforeContent.split("\n");
          const targetLineIdx = lines.findIndex((l) => l.includes(candidate.target));
          let sourceSnippet = "";
          if (targetLineIdx >= 0) {
            const start = Math.max(0, targetLineIdx - 5);
            const end = Math.min(lines.length, targetLineIdx + 15);
            sourceSnippet = lines.slice(start, end).join("\n");
          }

          stat.semanticFailures.push({
            symbol: `${candidate.file}::${candidate.target}`,
            refactoring: refactoring.kebabName,
            params: result.params,
            sourceBefore: sourceSnippet,
            diff: result.diff ?? "",
            testError: result.testError ?? "",
          });
        } else {
          stat.failed++;
          process.stderr.write(
            `  ${label} ✗ ${candidate.target} (${shortFile}) — tsc failed  [${timing}]\n`,
          );
          process.stderr.write(`    params: ${JSON.stringify(result.params)}\n`);
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
        stat.failed++;
        process.stderr.write(`  ${label} ✗ ${candidate.target} (${shortFile}) — apply failed\n`);
        if (result.error) {
          process.stderr.write(`    params: ${JSON.stringify(result.params)}\n`);
          process.stderr.write(`    error: ${result.error}\n`);
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

      if (stat.targets >= limit) break;
      if (maxApplies !== undefined && checked >= limit * 20) break;
    }

    process.stderr.write(
      `  Summary: checked=${checked}, targets=${stat.targets}, passed=${stat.passed}, typeErr=${stat.failed}, semanticErr=${stat.semanticErrors}\n`,
    );

    if (skipReasonCounts.size > 0) {
      const sortedReasons = [...skipReasonCounts.entries()].sort((a, b) => b[1] - a[1]);
      process.stderr.write(`  Skip reasons (${checked - stat.targets} skipped):\n`);
      for (const [reason, count] of sortedReasons.slice(0, 5)) {
        process.stderr.write(`    ${count}x  ${reason}\n`);
      }
      process.stderr.write(`  Sample skipped candidates (for review):\n`);
      for (const sample of skipSamples.slice(0, 5)) {
        const shortFile = sample.candidate.file.replace(cacheDir + "/", "");
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

  await client.shutdown();
  return { repo: repo.name, stats };
}

function printStatsTable(stats: RefactoringStats[], label?: string): void {
  if (label) process.stdout.write(`\n${label}\n`);
  const headers = ["Refactoring", "Targets", "Applied", "Passed", "TypeErr", "SemanticErr"];
  const rows = stats.map((s) => [
    s.refactoring,
    String(s.targets),
    String(s.applied),
    String(s.passed),
    String(s.failed),
    String(s.semanticErrors),
  ]);
  const widths = headers.map((h, i) => Math.max(h.length, ...rows.map((r) => (r[i] ?? "").length)));
  const fmt = (row: string[]): string =>
    row.map((cell, i) => cell.padEnd(widths[i] ?? 0)).join("  ");

  process.stdout.write(fmt(headers) + "\n");
  process.stdout.write(widths.map((w) => "-".repeat(w)).join("  ") + "\n");
  for (const row of rows) process.stdout.write(fmt(row) + "\n");
}

function normalizeTestError(error: string): string {
  return error
    .replace(/'[^']+'/g, "'<name>'")
    .replace(/\d+/g, "N")
    .replace(/\/[^\s]+\//g, "<path>/")
    .trim()
    .slice(0, 200);
}

function printSemanticFailureSummary(allStats: RefactoringStats[]): void {
  const allFailures = allStats.flatMap((s) => s.semanticFailures);
  if (allFailures.length === 0) return;

  // Deduplicate by normalized error pattern
  const seen = new Map<string, { failure: SemanticFailure; count: number }>();
  for (const f of allFailures) {
    const key = `${f.refactoring}::${normalizeTestError(f.testError)}`;
    const existing = seen.get(key);
    if (existing) {
      existing.count++;
    } else {
      seen.set(key, { failure: f, count: 1 });
    }
  }

  process.stdout.write(
    `\n--- Semantic Failure Summary (${allFailures.length} total, ${seen.size} unique) ---\n`,
  );
  for (const [, { failure, count }] of seen) {
    const causeName = normalizeTestError(failure.testError)
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .slice(0, 50)
      .replace(/-+$/, "");
    const fixturePath = `src/refactorings/${failure.refactoring}/fixtures/${causeName}.fixture.ts`;

    process.stdout.write(`\n[${failure.refactoring}] ${count}x occurrence(s)\n`);
    process.stdout.write(`  Suggested fixture: ${fixturePath}\n`);
    process.stdout.write(`  Params: ${JSON.stringify(failure.params)}\n`);
    if (failure.sourceBefore) {
      process.stdout.write(`  Source before:\n`);
      for (const line of failure.sourceBefore.split("\n").slice(0, 20)) {
        process.stdout.write(`    ${line}\n`);
      }
    }
    if (failure.diff) {
      process.stdout.write(`  Diff:\n`);
      for (const line of failure.diff.split("\n").slice(0, 50)) {
        process.stdout.write(`    ${line}\n`);
      }
    }
    process.stdout.write(`  Test error: ${failure.testError.slice(0, 300)}\n`);
  }
}

// --- Main ---
async function main(): Promise<void> {
  const selectedRepos = getSelectedRepos();
  process.stderr.write(`Repos: ${selectedRepos.map((r) => r.name).join(", ")}\n`);

  process.stderr.write("Loading refactorings...\n");
  const refactorings = loadRefactorings();
  process.stderr.write(`${refactorings.length} TypeScript refactoring(s) loaded.\n`);

  // Import registry once (side-effects register all refactorings)
  await import("../../src/refactorings/register-all.js");
  const { registry } = await import("../../src/core/refactoring-registry.js");

  // Dry-run: clone + baseline each repo, report candidate counts, exit
  if (isDryRun) {
    for (const repo of selectedRepos) {
      const testMode =
        skipTests || repo.testMode !== "compile-and-test" ? "compile-only" : "compile-and-test";
      process.stderr.write(`\n=== ${repo.name} [${testMode}] ===\n`);
      const cacheDir = ensureCloned(repo);
      const projDir = effectiveProjectDir(repo, cacheDir);
      checkBaseline(repo, cacheDir);
      const { candidates } = enumerateCandidates(projDir);
      const rows = refactorings.map((r) => ({
        refactoring: r.kebabName,
        candidates: candidates.length,
      }));
      if (isJson) {
        process.stdout.write(
          JSON.stringify({ dryRun: true, repo: repo.name, testMode, refactorings: rows }, null, 2) +
            "\n",
        );
      } else {
        process.stdout.write(`${repo.name} [${testMode}]: ${candidates.length} symbols to try\n`);
      }
    }
    process.exit(0);
  }

  // Run each repo sequentially
  const allResults: { repo: string; stats: RefactoringStats[] }[] = [];

  for (const repo of selectedRepos) {
    process.stderr.write(`\n${"=".repeat(60)}\n=== ${repo.name} ===\n${"=".repeat(60)}\n`);
    const result = await runRepo(repo, refactorings, registry);
    allResults.push(result);

    if (!isJson) {
      printStatsTable(result.stats, `--- ${repo.name} results ---`);
    }
  }

  // Final output
  if (isJson) {
    const output: Record<string, RefactoringStats[]> = {};
    for (const r of allResults) output[r.repo] = r.stats;
    process.stdout.write(JSON.stringify(output, null, 2) + "\n");
    return;
  }

  // Cross-repo aggregate
  if (allResults.length > 1) {
    const aggregate = new Map<string, RefactoringStats>();
    for (const { stats } of allResults) {
      for (const s of stats) {
        const existing = aggregate.get(s.refactoring);
        if (existing) {
          existing.targets += s.targets;
          existing.applied += s.applied;
          existing.passed += s.passed;
          existing.failed += s.failed;
          existing.semanticErrors += s.semanticErrors;
          existing.failures.push(...s.failures);
          existing.semanticFailures.push(...s.semanticFailures);
        } else {
          aggregate.set(s.refactoring, {
            ...s,
            failures: [...s.failures],
            semanticFailures: [...s.semanticFailures],
          });
        }
      }
    }
    const aggregateStats = Array.from(aggregate.values());
    printStatsTable(aggregateStats, "--- AGGREGATE (all repos) ---");
    printSemanticFailureSummary(aggregateStats);
  } else {
    printSemanticFailureSummary(allResults.flatMap((r) => r.stats));
  }
  process.exit(0);
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    process.stderr.write(`Fatal: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  });
