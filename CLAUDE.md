## Codebase navigation with roam

This project uses `roam` for codebase comprehension. Always prefer roam over Glob/Grep/Read exploration.

Before modifying any code:
1. First time in the repo: `roam understand` then `roam tour`
2. Find a symbol: `roam search <pattern>`
3. Before changing a symbol: `roam preflight <name>` (blast radius + tests + fitness)
4. Need files to read: `roam context <name>` (files + line ranges, prioritized)
5. Debugging a failure: `roam diagnose <name>` (root cause ranking)
6. After making changes: `roam diff` (blast radius of uncommitted changes)

Additional commands: `roam health` (0-100 score), `roam impact <name>` (what breaks),
`roam pr-risk` (PR risk score), `roam file <path>` (file skeleton).

Run `roam --help` for all commands. Use `roam --json <cmd>` for structured output.

# Project Architecture

## Project Overview

- **Files:** 146
- **Symbols:** 265
- **Edges:** 454
- **Languages:** typescript (86), markdown (46), yaml (5), json (3), bash (1), javascript (1)

## Directory Structure

| Directory | Files | Primary Language |
|-----------|-------|------------------|
| `src/` | 85 | typescript |
| `openspec/` | 31 | markdown |
| `./` | 9 | json |
| `.opencode/` | 8 | markdown |
| `.claude/` | 8 | markdown |
| `scripts/` | 3 | markdown |
| `.husky/` | 1 |  |
| `.github/` | 1 | yaml |

## Entry Points

- `src/refactorings/extract-superclass/index.ts`
- `src/refactorings/pull-up-constructor-body/index.ts`
- `src/refactorings/remove-subclass/index.ts`
- `src/refactorings/replace-constructor-with-factory-function/index.ts`
- `src/refactorings/replace-control-flag-with-break/index.ts`
- `src/refactorings/replace-loop-with-pipeline/index.ts`
- `src/refactorings/replace-subclass-with-delegate/index.ts`
- `src/refactorings/replace-superclass-with-delegate/index.ts`
- `src/refactorings/replace-type-code-with-subclasses/index.ts`

## Key Abstractions

Top symbols by importance (PageRank):

| Symbol | Kind | Location |
|--------|------|----------|
| `defineRefactoring function defineRefactoring<TContext = Project>(...` | function | `src/core/refactoring-builder.ts:213` |
| `createProgram function createProgram(): : Command` | function | `src/core/cli/program.ts:13` |
| `ApplyOptions interface ApplyOptions` | interface | `src/core/apply.ts:9` |
| `getGlobalOptions function getGlobalOptions(cmd: Command): : Glob...` | function | `src/core/cli/context.ts:9` |
| `ParamHelper interface ParamHelper` | interface | `src/core/refactoring-builder.ts:15` |
| `parseKeyValueArgs function parseKeyValueArgs(args: string[]): : R...` | function | `src/core/cli/commands/apply.ts:8` |
| `PullUpContext interface PullUpContext extends ClassContext` | interface | `src/refactorings/pull-up-constructor-body/index.ts:7` |
| `createDescribeCommand function createDescribeCommand(): : Command` | function | `src/core/cli/commands/describe.ts:6` |
| `createListCommand function createListCommand(): : Command` | function | `src/core/cli/commands/list.ts:6` |
| `preconditions function preconditions(project: Project, params...` | function | `src/refactorings/replace-type-code-with-subclasses/index.ts:5` |
| `buildForEachReplacement function buildForEachReplacement(
  expression:...` | function | `src/refactorings/replace-loop-with-pipeline/index.ts:7` |
| `processStatements function processStatements(statements: Node[]):...` | function | `src/refactorings/replace-nested-conditional-with-guard-clauses/index.ts:18` |
| `forEachDeclaration function* forEachDeclaration(
  sourceFiles: So...` | function | `src/core/symbol-resolver.ts:122` |
| `createReferencesCommand function createReferencesCommand(): : Command` | function | `src/core/cli/commands/references.ts:7` |
| `createSearchCommand function createSearchCommand(): : Command` | function | `src/core/cli/commands/search.ts:8` |

## Architecture

- **Dependency layers:** 6
- **Cycles (SCCs):** 0
- **Layer distribution:** L0: 143 symbols, L1: 65 symbols, L2: 34 symbols, L3: 14 symbols, L4: 5 symbols

## Testing

- **Test files:** 31
- **Source files:** 115
- **Test-to-source ratio:** 0.27

## Coding Conventions

Follow these conventions when writing code in this project:

- **Classes:** Use `PascalCase` (100% of 1 classes)
- **Imports:** Prefer absolute imports (100% are cross-directory)

## Error Handling

Use `neverthrow` Result types for all expected failure paths. Never throw exceptions for expected errors — return `err()` instead. Import named Result types from `src/core/errors.ts` (e.g. `ParamResult<T>`, `ProjectResult<T>`). Exceptions are only acceptable at system boundaries (CLI command handlers, daemon socket parsing, eval'd fixture code).

## Complexity Hotspots

Average function complexity: 2.7 (168 functions analyzed)


## Domain Keywords

- **Package:** refactoring-cli
- **Description:** Agent-consumable CLI for applying Martin Fowler's catalog of refactorings to TypeScript codebases with guaranteed semantic preservation
- **Top domain terms:** preconditions, command, refactoring, declaration, method, references, statements, statement, param, replacement, imports, extract, file, flag, search, unused, forwarding, delegating, snapshots, registry

## Refactoring with refactoring-cli

This project has `refactoring-cli` available globally. When performing refactorings,
prefer using the `refactor` CLI over manual AST edits.

### Workflow
1. `refactor search <pattern>` to find the symbol to refactor
2. `refactor describe <name>` to check params and preconditions
3. `refactor apply <name> file=<path> target=<name> [key=value...]` to apply
4. `refactor apply <name> ... --dry-run` to preview changes first

### Key commands
- `refactor list --json` — all available refactorings
- `refactor describe <name> --json` — params and preconditions for a refactoring
- `refactor apply <name> [params...] --json` — apply with structured output
- `refactor unused --json` — find dead code to clean up
- `refactor fix-imports --json` — fix broken imports after moves

## Core Modules

Most-imported modules (everything depends on these):

| Module | Imported By | Symbols Used |
|--------|-------------|--------------|
| `src/core/refactoring-builder.ts` | 71 files | 273 |
| `src/core/cli/context.ts` | 8 files | 16 |
| `src/core/symbol-resolver.ts` | 7 files | 13 |
| `src/core/refactoring-registry.ts` | 4 files | 9 |
| `src/core/cli/commands/fix-imports.ts` | 2 files | 3 |
| `src/core/cli/commands/apply.ts` | 1 files | 2 |
| `src/core/cli/commands/describe.ts` | 1 files | 2 |
| `src/core/cli/commands/help.ts` | 1 files | 2 |
| `src/core/cli/commands/list.ts` | 1 files | 2 |
| `src/core/cli/commands/references.ts` | 1 files | 2 |