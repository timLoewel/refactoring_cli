import { spawnSync } from "child_process";
import { cpSync, existsSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "fs";
import { dirname, join, sep } from "path";
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
const WORK_DIR = join(ROOT, "tmp", "real-codebase", "work");

// --- Arg parsing ---
const scriptArgs = process.argv.slice(2);
const isDryRun = scriptArgs.includes("--dry-run");
const isJson = scriptArgs.includes("--json");
const refactoringFilter = ((): string | undefined => {
  const idx = scriptArgs.indexOf("--refactoring");
  return idx >= 0 ? scriptArgs[idx + 1] : undefined;
})();

const maxCandidates = ((): number | undefined => {
  const idx = scriptArgs.indexOf("--max-candidates");
  return idx >= 0 ? parseInt(scriptArgs[idx + 1], 10) : undefined;
})();

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

  return { candidates, reverseImportMap };
}

// --- Transitive scope computation ---
function computeScope(file: string, reverseImportMap: Map<string, Set<string>>): Set<string> {
  const scope = new Set<string>([file]);
  const queue: string[] = [file];
  while (queue.length > 0) {
    const current = queue.shift() as string;
    for (const importer of reverseImportMap.get(current) ?? []) {
      if (!scope.has(importer)) {
        scope.add(importer);
        queue.push(importer);
      }
    }
  }
  return scope;
}

// --- Build apply params ---
function buildApplyArgs(refactoring: RefactoringInfo, file: string, target: string): string[] {
  const args: string[] = [refactoring.kebabName];
  for (const p of refactoring.params) {
    if (!p.required) continue;
    if (p.name === "file") {
      args.push(`file=${file}`);
    } else if (p.name === "target") {
      args.push(`target=${target}`);
    } else if (p.type === "number") {
      args.push(`${p.name}=0`);
    } else {
      // string / identifier — provide a valid identifier placeholder
      args.push(`${p.name}=__reftest__`);
    }
  }
  return args;
}

// --- Step 5: Apply in isolated copy ---
interface CandidateResult {
  /** true if preconditions passed and apply was attempted */
  isTarget: boolean;
  applied: boolean;
  passed: boolean;
  error: string | null;
}

let workCounter = 0;

function makeTempCopy(): string {
  const tempDir = join(WORK_DIR, `work-${workCounter++}`);
  // Remove any leftover dir from a previous interrupted run
  if (existsSync(tempDir)) {
    rmSync(tempDir, { recursive: true, force: true });
  }
  // Copy source files only; symlink node_modules for speed
  cpSync(CACHE_DIR, tempDir, {
    recursive: true,
    filter: (src) => !src.includes(`${sep}node_modules`),
  });
  symlinkSync(join(CACHE_DIR, "node_modules"), join(tempDir, "node_modules"));
  return tempDir;
}

function applyAndCheck(
  refactoring: RefactoringInfo,
  candidate: Candidate,
  reverseImportMap: Map<string, Set<string>>,
): CandidateResult {
  const tempDir = makeTempCopy();

  const relPath = candidate.file.slice(CACHE_DIR.length);
  const tempFile = join(tempDir, relPath);

  const applyArgs = buildApplyArgs(refactoring, tempFile, candidate.target);

  try {
    const out = runCLI(["apply", ...applyArgs], tempDir);

    if (!out.ok) {
      return { isTarget: true, applied: false, passed: false, error: out.error };
    }

    if (!out.output.success) {
      const msg = (out.output.errors ?? []).join("; ");
      const isPreconditionFailure =
        msg.includes("Precondition failed") || msg.includes("not found") || msg.includes("param '");
      if (isPreconditionFailure) {
        return { isTarget: false, applied: false, passed: false, error: null };
      }
      return { isTarget: true, applied: false, passed: false, error: msg };
    }

    // Step 5.3: compile check using TypeORM's own tsc
    const tsc = join(CACHE_DIR, "node_modules/.bin/tsc");

    // Use scoped tsconfig when possible (file ∪ transitive importers only)
    const inMap = reverseImportMap.has(candidate.file);
    let tscResult: { stdout: string; stderr: string; code: number };
    if (inMap) {
      const scope = computeScope(candidate.file, reverseImportMap);
      const scopedPaths = Array.from(scope).map((p) => p.replace(CACHE_DIR, tempDir));
      const scopedTsconfig = JSON.stringify({ extends: "./tsconfig.json", include: scopedPaths });
      writeFileSync(join(tempDir, "tsconfig.scoped.json"), scopedTsconfig);
      tscResult = runShell(`"${tsc}" --noEmit --project tsconfig.scoped.json`, tempDir);
    } else {
      tscResult = runShell(`"${tsc}" --noEmit`, tempDir);
    }

    return {
      isTarget: true,
      applied: true,
      passed: tscResult.code === 0,
      error: tscResult.code !== 0 ? tscResult.stdout.slice(0, 500) : null,
    };
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
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

// --- Main ---
function main(): void {
  ensureCloned();
  checkBaseline();

  process.stderr.write("Loading refactorings...\n");
  const refactorings = loadRefactorings();
  process.stderr.write(`${refactorings.length} TypeScript refactoring(s) loaded.\n`);

  process.stderr.write("Enumerating candidates...\n");
  const { candidates: allCandidates, reverseImportMap } = enumerateCandidates(CACHE_DIR);
  const candidates =
    maxCandidates !== undefined ? allCandidates.slice(0, maxCandidates) : allCandidates;
  process.stderr.write(
    `${candidates.length} symbol candidates${maxCandidates !== undefined ? ` (capped from ${allCandidates.length})` : ""} found.\n`,
  );

  // Step 6.1: dry-run — report candidate counts and exit
  if (isDryRun) {
    const rows = refactorings.map((r) => ({
      refactoring: r.kebabName,
      candidates: candidates.length,
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

  mkdirSync(WORK_DIR, { recursive: true });

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

    const total = candidates.length;
    process.stderr.write(`\nTesting: ${refactoring.kebabName} (${total} symbols to check)\n`);

    let checked = 0;
    for (const candidate of candidates) {
      const result = applyAndCheck(refactoring, candidate, reverseImportMap);
      checked++;

      if (!result.isTarget) continue;

      stat.targets++;
      if (result.applied) {
        stat.applied++;
        if (result.passed) {
          stat.passed++;
          process.stderr.write(
            `  [${checked}/${total}] ✓ ${candidate.target} (${candidate.file.split("/").pop()}) — tsc passed\n`,
          );
        } else {
          stat.failed++;
          process.stderr.write(
            `  [${checked}/${total}] ✗ ${candidate.target} (${candidate.file.split("/").pop()}) — tsc failed\n`,
          );
          if (result.error) {
            stat.failures.push({
              symbol: `${candidate.file}::${candidate.target}`,
              error: result.error,
            });
          }
        }
      } else {
        // CLI crash or non-precondition apply failure
        stat.failed++;
        process.stderr.write(
          `  [${checked}/${total}] ✗ ${candidate.target} (${candidate.file.split("/").pop()}) — apply failed: ${result.error}\n`,
        );
        if (result.error) {
          stat.failures.push({
            symbol: `${candidate.file}::${candidate.target}`,
            error: result.error,
          });
        }
      }
    }

    process.stderr.write(
      `\n  Summary: checked ${total}, targets found ${stat.targets}, passed ${stat.passed}, failed ${stat.failed}\n`,
    );
    stats.push(stat);
  }

  rmSync(WORK_DIR, { recursive: true, force: true });

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

main();
