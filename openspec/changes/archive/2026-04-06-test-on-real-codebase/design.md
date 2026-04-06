## Context

The CLI currently validates refactorings only through hand-crafted fixtures in `src/refactorings/*/fixtures/`. These cover known patterns but miss the variety found in real production TypeScript code. Crashes, precondition false-positives, and broken import rewrites tend to surface only on realistic codebases.

TypeORM is a suitable target: it's a well-maintained, OOP-heavy TypeScript project with rich class hierarchies (inheritance chains, abstract base classes, entity managers) that map directly to the refactoring catalog.

## Goals / Non-Goals

**Goals:**
- Clone a pinned TypeORM commit into a temp directory
- For each registered refactoring, scan for symbols where preconditions pass
- Apply each candidate in isolation (reset between candidates)
- Run `tsc --noEmit` after each apply and record pass/fail
- Emit a summary table: refactoring → targets found / applied / passed / failed
- Support `--dry-run` (discover targets, skip apply/compile)
- Support `--refactoring <name>` to run a single refactoring

**Non-Goals:**
- Running TypeORM's own test suite (too slow for initial version)
- Round-trip / invertibility testing
- CI integration (this version is a local developer script)
- Testing against multiple codebases simultaneously

## Decisions

### Script vs. new CLI command
**Decision**: A standalone Node.js script under `scripts/test-real-codebase/run.ts`, invoked via `npm run test:real`.

**Rationale**: Keeps the core CLI clean; avoids shipping testing infrastructure as part of the distributed tool. A script is easier to iterate on without versioning constraints.

**Alternative considered**: A `refactor test-real` subcommand — rejected because testing tooling is not part of the end-user CLI surface.

### Isolation strategy per candidate
**Decision**: Clone once; before each apply, copy the working tree into a fresh temp subdirectory and apply there.

**Rationale**: Full re-clone per candidate is too slow (~hundreds of candidates × clone time). In-place apply + git reset is simpler but risks state bleed if the CLI crashes mid-apply. Copy-on-apply balances speed and isolation.

**Alternative considered**: `git stash` / `git checkout .` between applies — rejected because git state management adds complexity and can be fragile if the CLI leaves partial writes.

### Compilation check
**Decision**: Run `tsc --noEmit` using TypeORM's own `tsconfig.json` after each apply.

**Rationale**: TypeORM's tsconfig captures the exact compiler flags the project uses, so errors caught here are genuine. Using a generic tsconfig would produce false positives.

### Pinned commit
**Decision**: Pin a specific TypeORM git SHA in the script config and document it.

**Rationale**: TypeORM changes over time; a floating `main` branch would make failures non-reproducible. The SHA can be bumped deliberately.

## Risks / Trade-offs

- **Slow runtime** → Mitigate with `--refactoring` filter and `--dry-run` for discovery-only runs. Full run may take several minutes.
- **TypeORM clones on every run** → Mitigate with a local cache: skip clone if the pinned SHA already exists in `tmp/`.
- **False failures from TypeORM's own type errors** → Mitigate by verifying the baseline compiles before running any applies; abort with a clear message if not.
- **Precondition scan may be slow on large codebases** → Acceptable for a dev script; can be parallelised in a future iteration.

## Open Questions

- Should the script cache the cloned repo between runs (skip re-clone if SHA matches)? Likely yes — implement as default behavior.
- Should failed candidates emit a diff to help diagnose issues? Useful but adds complexity; defer to a `--verbose` flag.
