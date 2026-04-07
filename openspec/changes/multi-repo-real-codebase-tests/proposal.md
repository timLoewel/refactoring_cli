## Why

The real-codebase test runner currently validates refactorings against a single repo (TypeORM). One codebase covers one architectural style (class-heavy ORM with decorators). Bugs that manifest only in functional codebases, middleware-oriented frameworks, or pure utility libraries go undetected. Adding multiple repos with diverse styles increases coverage without changing the test infrastructure significantly.

## What Changes

- Extract repo configuration (URL, ref, install command) from hardcoded constants into a `REPOS` array in `run.ts`
- Add `--repo <name>` CLI flag to select which repo to test (default: all, or `typeorm` for backward compat)
- Add 5 repos representing different TypeScript architectural styles:
  1. **TypeORM** (existing) - class-heavy ORM, decorators, inheritance hierarchies
  2. **Zod** - functional builder pattern, type-level programming, method chaining
  3. **date-fns** - pure function utility library, modular exports, no classes
  4. **Inversify** - IoC container, decorator-based dependency injection
  5. **ts-pattern** - pattern matching, ADTs, type-level generics, exhaustive checking
- Run all refactorings with `--max-candidates 50` against each repo
- Add failures discovered as new fixture test cases in the relevant refactoring directories

## Capabilities

### New Capabilities
- `multi-repo-test-targets`: Configuration and selection of multiple real-world TypeScript repositories for the test runner

### Modified Capabilities
- `real-codebase-test-runner`: Runner must support a configurable list of repos and a `--repo` flag to select targets

## Impact

- `scripts/test-real-codebase/run.ts` — main changes (repo config, CLI flag, loop over repos)
- `src/refactorings/*/fixtures/` — new fixture files for discovered bugs
- `tmp/real-codebase/` — additional cached repo clones (~5 repos)
- CI time increases proportionally with repo count (mitigated by `--repo` flag for selective runs)
