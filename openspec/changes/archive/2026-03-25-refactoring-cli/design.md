## Context

Greenfield TypeScript CLI project. No existing code — the repo currently contains only OpenSpec configuration. The tool will be consumed exclusively by AI agents (Claude Code, Cursor, etc.) via JSON CLI output. It must be deterministic, safe, and introspectable.

## Goals / Non-Goals

**Goals:**
- Strict, production-grade TypeScript project setup from day one
- All 66 Fowler refactorings implemented as AST-level transformations via ts-morph
- Every refactoring provably preserves semantics (compile + run + compare)
- Agent-first CLI: JSON output, typed parameter schemas, discoverable catalog
- Utility commands (search, references, unused, fix-imports) that also serve as internal building blocks for refactorings
- 90%+ test coverage enforced via pre-commit hooks

**Non-Goals:**
- Human-friendly interactive mode (agents only)
- Multi-language support (TypeScript only)
- IDE plugins or editor integrations
- Refactorings beyond Fowler's catalog
- Performance optimization for very large codebases (>10k files) in v1

## Decisions

### 1. ts-morph as the transformation engine

**Choice:** ts-morph (TypeScript compiler API wrapper)
**Over:** jscodeshift, babel, tree-sitter, raw string manipulation

**Rationale:** ts-morph provides full type information, symbol resolution, and reference tracking — all critical for semantic-preserving transforms. It wraps the TypeScript compiler API with a developer-friendly interface. Since we're TypeScript-only, there's no multi-language tax. jscodeshift lacks type info. Babel doesn't understand TS deeply. tree-sitter is parse-only (no type checker).

### 2. commander.js for CLI framework

**Choice:** commander.js
**Over:** yargs, oclif, clipanion

**Rationale:** Lightweight, well-typed, zero magic. oclif is too heavy for a tool that doesn't need plugin architecture. yargs is fine but commander has better TypeScript support. We need subcommands (`apply`, `search`, `list`) and typed options — commander handles this cleanly.

### 3. One module per refactoring

**Structure:**
```
src/refactorings/<kebab-name>/
├── index.ts              # implements RefactoringDefinition interface
├── <kebab-name>.test.ts  # jest test using fixture harness
└── fixtures/
    ├── basic.fixture.ts
    ├── edge-case.fixture.ts
    └── ...
```

**Rationale:** Each refactoring is self-contained. Easy to add, test, and maintain independently. The fixture directory co-locates test data with the refactoring. A refactoring can be developed and merged without touching any other refactoring.

### 4. Refactoring interface

```typescript
interface RefactoringDefinition<TParams = Record<string, unknown>> {
  name: string;                        // e.g. "Extract Function"
  kebabName: string;                   // e.g. "extract-function"
  description: string;                 // short, LLM-consumable
  tier: 1 | 2 | 3 | 4;
  params: ParamSchema<TParams>;        // typed parameter definitions
  preconditions: (project: Project, params: TParams) => PreconditionResult;
  apply: (project: Project, params: TParams) => RefactoringResult;
}

interface ParamSchema<T> {
  definitions: ParamDefinition[];      // name, type, description, required
  validate: (raw: unknown) => T;       // parse + validate
}

interface RefactoringResult {
  success: boolean;
  filesChanged: string[];
  description: string;                 // human-readable summary of what changed
  diff: FileDiff[];                    // per-file diffs
}
```

**Rationale:** Typed params give agents introspectable schemas via `describe --json`. Preconditions fail fast before touching any files. The result includes diffs for agent verification.

### 5. Test harness: compile-and-run fixture comparison

```
For each fixture file:
1. Load fixture as a standalone TS program (must export main(): string)
2. Compile with tsc, run, capture stdout → "before"
3. Create in-memory copy via ts-morph Project
4. Apply refactoring transformation
5. Compile with tsc, run, capture stdout → "after"
6. Assert before === after (semantic preservation)
7. Assert refactored code compiles without errors
8. Assert structural change actually happened (not a no-op)
```

Fixtures are self-contained TypeScript files. Each exports a `main()` that returns a string (deterministic output). No side effects, no randomness, no I/O.

**Over:** Snapshot testing, AST comparison

**Rationale:** Compiling and running is the ultimate semantic check. AST comparison would be too rigid (the whole point is the AST changes). Snapshot testing checks output but doesn't verify compilation.

### 6. Project model and .refactorignore

The tool loads the target project's tsconfig.json via ts-morph, then applies `.refactorignore` as an additional exclusion layer. The ignore file uses gitignore syntax.

Resolution order:
1. `--config` flag → explicit tsconfig path
2. `--path` flag → look for tsconfig.json in that dir
3. cwd → look for tsconfig.json

`.refactorignore` is looked up in the project root. If absent, only tsconfig exclude/include rules apply.

### 7. JSON output structure

Every command returns a consistent envelope:

```typescript
interface CLIOutput<T> {
  success: boolean;
  command: string;
  data: T;
  errors?: string[];
  warnings?: string[];
}
```

This lets agents reliably parse any command's output without per-command parsing logic.

## Architecture

```
src/
├── cli/
│   ├── index.ts                    # entry point, commander setup
│   ├── commands/
│   │   ├── apply.ts                # refactor apply <name> [options]
│   │   ├── list.ts                 # refactor list [--tier] [--json]
│   │   ├── describe.ts             # refactor describe <name>
│   │   ├── search.ts               # refactor search <entity>
│   │   ├── references.ts           # refactor references <entity>
│   │   ├── unused.ts               # refactor unused
│   │   ├── fix-imports.ts          # refactor fix-imports
│   │   └── help.ts                 # refactor help
│   └── output.ts                   # JSON envelope, formatting
├── engine/
│   ├── project-model.ts            # ts-morph project loading, .refactorignore
│   ├── refactoring-registry.ts     # discovers and indexes all 66 refactorings
│   ├── refactoring.types.ts        # RefactoringDefinition, ParamSchema, etc.
│   ├── preconditions.ts            # shared precondition checks
│   └── symbol-resolver.ts          # entity search, reference finding, unused detection
├── refactorings/
│   ├── index.ts                    # barrel export, registry population
│   ├── extract-function/
│   │   ├── index.ts
│   │   ├── extract-function.test.ts
│   │   └── fixtures/
│   ├── inline-variable/
│   │   ├── index.ts
│   │   ├── inline-variable.test.ts
│   │   └── fixtures/
│   └── ... (66 total)
├── testing/
│   ├── fixture-runner.ts           # compile, run, compare harness
│   └── test-helpers.ts             # shared test utilities
└── utils/
    └── ignore.ts                   # .refactorignore parser
```

### Data flow

```
CLI Command
    │
    ▼
Project Model (ts-morph Project + .refactorignore)
    │
    ├──▶ Symbol Resolver (search, references, unused)
    │
    └──▶ Refactoring Registry
              │
              ▼
         RefactoringDefinition
              │
              ├── preconditions(project, params)
              │       │
              │       ▼
              │   Pass/Fail with reason
              │
              └── apply(project, params)
                      │
                      ▼
                  RefactoringResult (files changed, diffs)
                      │
                      ▼
                  project.save() — writes to disk
```

## Risks / Trade-offs

**[Risk] ts-morph performance on large projects** → v1 targets small-to-medium codebases. For large projects, lazy loading and incremental updates can be added later. The `.refactorignore` already reduces scope.

**[Risk] Fixture tests are slow (compile + run per fixture)** → Each fixture is tiny (< 50 lines). Parallel test execution via Jest workers mitigates this. Expect ~2-5 seconds per refactoring test suite.

**[Risk] Some refactorings have complex preconditions** → Tier 4 refactorings (inheritance manipulation) have many edge cases. Start with Tier 1 to validate the architecture, then iterate. Each refactoring is independent — partial catalog is still useful.

**[Risk] Cross-file refactorings (Move Function, Rename across codebase) need multi-file fixtures** → Allow fixtures to be directories containing multiple .ts files with a shared tsconfig, not just single files. The harness must support both.

**[Trade-off] TypeScript-only limits addressable market** → Acceptable. TypeScript has the richest compiler API of any language, making semantic preservation guarantees feasible. Multi-language would compromise reliability.

**[Trade-off] Agent-only means no human UX investment** → Correct trade-off for v1. Human-friendly output can be layered later without changing the core.

## Open Questions

1. **Package name:** `refactoring-cli`, `refactor-ts`, or something else?
2. **Should `apply` auto-save or require explicit confirmation?** Current design: `apply` writes to disk, `--dry-run` previews. No confirmation step (agents don't do interactive confirmation).
3. **How to handle refactorings that need multi-file fixtures?** Proposed: fixture can be a `.ts` file OR a directory with a `tsconfig.json` and multiple `.ts` files.
