## Context

The test runner (`scripts/test-real-codebase/run.ts`) applies each refactoring to isolated temp copies of TypeORM and then runs `tsc --noEmit` on the full project to verify correctness. On TypeORM 0.3.20, this full-project tsc takes ~15s per successful apply. With ~12,000 candidates per refactoring and 66 refactorings, tsc cost dominates total runtime.

During candidate enumeration, the script already loads the entire TypeORM project into a ts-morph `Project` instance (~3 min one-time cost). Every source file and its import graph are loaded into memory at that point. The information needed to scope compilation is already present — it just isn't captured.

The current flow for a successful apply:

```
makeTempCopy() → runCLI(apply) → tsc --noEmit (full project, ~15s) → rmSync(tempDir)
```

Target flow after this change:

```
makeTempCopy() → runCLI(apply) → tsc --noEmit (scoped tsconfig, ~1s) → rmSync(tempDir)
```

The scoped tsconfig includes only the changed file and files that (transitively) import it. A compilation error in the changed file will propagate to its importers — so this set is sufficient to detect breakage.

## Goals / Non-Goals

**Goals:**
- Build a reverse import map from the ts-morph project during the existing enumeration pass (zero extra I/O cost)
- Pre-compute per-candidate scope: `{candidate.file} ∪ transitive importers of candidate.file`
- Generate a minimal in-memory tsconfig for each apply attempt that includes only the scoped file set
- Write that tsconfig to the temp dir before running tsc, replacing the full-project check
- Reduce post-apply tsc from ~15s to ~1s per successful candidate

**Non-Goals:**
- No changes to the CLI or any `src/` module
- No caching of reverse maps between runs (map is cheap to build during the one-time enumeration)
- Not applicable to failed applies (precondition failures skip tsc entirely — no change needed)
- No reduction in the enumeration time itself (~3 min ts-morph load is out of scope here)

## Decisions

### Decision 1: Build the reverse import map during `enumerateCandidates`

`enumerateCandidates` already iterates all `project.getSourceFiles()`. Extending it to also collect `sf.getImportDeclarations()` and resolve their source files is a zero-cost side-effect of the same traversal.

The forward graph (file → files it imports) is collected first; the reverse map (file → files that import it) is derived by inverting.

**Alternative: build the map lazily per candidate at apply time** — rejected because it would require re-loading the project (or passing it as a global), and the enumeration pass is the natural place to capture it.

### Decision 2: Transitive closure via iterative BFS

Starting from the candidate file, walk the reverse import map breadth-first, collecting all transitive importers. BFS is simple, non-recursive (avoids stack overflow on deep graphs), and produces no duplicates when using a `Set` as the visited guard.

```
scope = new Set([candidateFile])
queue = [candidateFile]
while queue not empty:
  file = queue.shift()
  for importer of reverseMap.get(file) ?? []:
    if not scope.has(importer):
      scope.add(importer)
      queue.push(importer)
```

**Alternative: DFS** — equivalent in correctness, BFS chosen for slightly more predictable memory use on wide graphs.

### Decision 3: Scoped tsconfig written to the temp dir

The minimal tsconfig is written as `tsconfig.scoped.json` in the temp dir root. It extends the original `tsconfig.json` (so all compiler options are inherited) and overrides `include` with the scoped file list.

```json
{
  "extends": "./tsconfig.json",
  "include": ["src/entity/User.ts", "src/subscriber/UserSubscriber.ts", ...]
}
```

`tsc --noEmit --project tsconfig.scoped.json` is run instead of the bare `tsc --noEmit`.

**Alternative: pass `--files` directly on the tsc command line** — tsc does not support a `--files` flag for file lists at the command line; the tsconfig approach is the standard mechanism.

**Alternative: use `ts.createProgram` programmatically** — adds complexity and a direct ts dependency to the script; not worth it when a generated tsconfig file works.

### Decision 4: `enumerateCandidates` returns the reverse map alongside candidates

The function signature changes from:

```typescript
function enumerateCandidates(projectDir: string): Candidate[]
```

to:

```typescript
interface EnumerationResult {
  candidates: Candidate[];
  reverseImportMap: Map<string, Set<string>>;
}
function enumerateCandidates(projectDir: string): EnumerationResult
```

The reverse map is keyed on absolute file paths (same format as `Candidate.file`). The map is passed through `main()` to `applyAndCheck()` alongside the candidate.

**Alternative: compute scope inside `applyAndCheck` from a module-level map** — a mutable global is harder to test and reason about; explicit parameter passing is cleaner.

### Decision 5: Fall back to full-project tsc if scope is empty or not found

If a candidate file has no entry in the reverse map (e.g., it was not part of the ts-morph enumeration, or it's a type-declaration-only file), fall back to the existing full-project `tsc --noEmit`. This avoids false positives from an incomplete scope.

## Risks / Trade-offs

**[Risk] Scoped tsc misses cross-file breakage** → Mitigation: the transitive importer set is the minimal set that can observe breakage via the type system. Files that do not (directly or transitively) import the changed file cannot be broken by a change to its API. This is structurally sound for TypeScript's single-direction import model.

**[Risk] Declaration files (`*.d.ts`) in scope inflate the file list** → Mitigation: declaration files are read-only and tsc treats them as ambient; including them is harmless and they are already part of the original project. No special handling needed.

**[Risk] Circular imports cause BFS to loop infinitely** → Mitigation: the `visited` Set guards against revisiting nodes. TypeScript itself allows circular imports; the BFS handles them correctly.

**[Risk] The scoped tsconfig `extends` path breaks if temp dir layout differs from cache dir** → Mitigation: `makeTempCopy` does a full `cpSync` of the source tree, so `tsconfig.json` is always present at the temp root and `extends: "./tsconfig.json"` resolves correctly.

**[Risk] Very wide reverse graphs (a commonly-imported utility file) produce large file lists with marginal speedup** → Mitigation: this is a best-effort optimization. Even a large scoped list (e.g., 200 files out of 800) is substantially faster than a full-project tsc. No cap is applied; the fallback only triggers on missing map entries.

## Migration Plan

All changes are confined to `scripts/test-real-codebase/run.ts`. No deployment steps. No rollback strategy needed — the script is a test utility, not shipped code. Reverting is a git revert of a single file.
