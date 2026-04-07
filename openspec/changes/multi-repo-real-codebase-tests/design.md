## Context

The real-codebase test runner (`scripts/test-real-codebase/run.ts`) hardcodes TypeORM as the sole test target. The repo URL, git ref, cache directory, and install command are all inline constants. The runner's architecture (clone → baseline → enumerate → apply → check → rollback) is repo-agnostic — only the configuration is TypeORM-specific.

## Goals / Non-Goals

**Goals:**
- Support multiple configurable repos in the test runner
- Allow selecting a single repo via `--repo <name>` for fast iteration
- Choose 5 repos covering distinct TypeScript architectural styles
- Run refactorings against each repo and capture failures

**Non-Goals:**
- Parallel execution across repos (sequential is fine)
- Repo-specific candidate enumeration strategies (reuse existing weighted shuffle)
- Changing the apply/check/rollback core logic

## Decisions

### 1. Repo configuration as inline array

Extract repo config into a `RepoConfig[]` array at the top of `run.ts`. Each entry has: `name`, `url`, `ref`, `cacheDir` (derived), and optional `installCmd` override (default: `npm install --ignore-scripts`).

**Why not a separate config file?** This is test infrastructure, not user-facing config. Inline keeps it simple and grep-able. A config file adds indirection for no benefit with 5-6 entries.

### 2. Repo selection

- `--repo typeorm` runs only TypeORM
- `--repo all` or no flag runs all repos sequentially
- Each repo gets its own daemon instance (start → run → stop → next)

The daemon must be restarted per repo because it holds a ts-morph Project bound to a specific tsconfig.

### 3. Chosen repositories

| Repo | Style | Why |
|------|-------|-----|
| TypeORM 0.3.20 | Class-heavy ORM, decorators, deep inheritance | Already validated; class/method refactorings |
| Zod 3.24.4 | Functional builder, method chaining, type gymnastics | Tests refactorings on chained APIs and generics |
| date-fns 4.1.0 | Pure functions, modular exports, no classes | Tests function-level refactorings in flat architecture |
| Inversify 6.2.2 | IoC container, decorators, DI pattern | Tests decorator-based and interface-heavy code |
| ts-pattern 5.9.0 | Pattern matching, ADTs, type-level generics | Tests exhaustive matching and complex generic signatures |

Selection criteria: each repo must (a) have a root `tsconfig.json`, (b) compile with `tsc --noEmit` after `npm install`, (c) be single-package (not a monorepo requiring workspace tooling).

**Risk: some repos may not compile cleanly.** Mitigation: pin exact versions known to compile; the baseline check already catches this and skips broken repos.

### 4. Stats aggregation

Per-repo stats are printed independently (same format as today). A final cross-repo summary groups failures by refactoring name across all repos.

## Risks / Trade-offs

- **Repo compilation failures** → Baseline check aborts that repo; others continue. Some repos may need `tsconfig` path overrides.
- **Longer CI time** → 5x more repos. Mitigated by `--repo` flag and `--max-candidates` limit. CI can run repos in parallel jobs.
- **Repo-specific install quirks** → Allow per-repo `installCmd` override in config. Some repos may need `yarn` or extra flags.
- **Monorepo false positives** → Only pick single-package repos. If a repo turns out to be a monorepo, swap it for an alternative.
