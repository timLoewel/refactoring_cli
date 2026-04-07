# refactoring-cli

Agent-consumable CLI for applying [Martin Fowler's catalog of refactorings](https://refactoring.com/catalog/) to TypeScript codebases with guaranteed semantic preservation.

Designed to be called by AI coding agents (Claude Code, OpenCode, etc.) but works just as well from the command line.

## Installation

```bash
npm install -g refactoring-cli
```

Or run without installing:

```bash
npx refactoring-cli list --json
```

Requires Node.js >= 18.

## Quick Start

```bash
# List all 66 available refactorings
refactor list

# Get details about a specific refactoring
refactor describe extract-variable

# Apply a refactoring (params are passed as key=value pairs)
refactor apply extract-variable file=src/app.ts target="x + 1" name=total

# Preview changes without writing to disk
refactor apply extract-variable file=src/app.ts target="x + 1" name=total --dry-run

# Target a project in a different directory
refactor --path /path/to/project apply inline-variable file=src/utils.ts target=temp
```

## Commands

| Command | Description |
|---------|-------------|
| `refactor list` | List all available refactorings |
| `refactor describe <name>` | Show params, preconditions, and example for a refactoring |
| `refactor apply <name> [key=value...]` | Apply a refactoring to the target project |
| `refactor search <pattern>` | Search for symbols in the project |
| `refactor references <name>` | Find all references to a symbol |
| `refactor unused` | Find unused symbols in the project |
| `refactor fix-imports` | Detect and fix broken imports |
| `refactor help` | Show usage guide with examples |

All commands support `--json` for structured output and `--path <dir>` to target a different project directory.

## Project Resolution

The CLI finds your project by locating `tsconfig.json`. It searches upward from the current directory (or the directory given via `--path`) through parent directories until it finds one. The nearest `tsconfig.json` wins.

This means you can run `refactor` from any subdirectory of your project and it will find the root automatically.

**Monorepo note:** In monorepos with multiple `tsconfig.json` files (e.g., one per package), the CLI picks the nearest ancestor. If you need to target a specific package root, pass `--path` explicitly:

```bash
refactor --path packages/api apply extract-variable file=src/app.ts target="x + 1" name=total
```

You can also point directly at a specific tsconfig with `--config`:

```bash
refactor --config tsconfig.build.json apply ...
```

## Available Refactorings

66 refactorings organized across 4 tiers, covering variables, functions, conditionals, classes, and inheritance:

<details>
<summary>Full list</summary>

**Variables:** extract-variable, inline-variable, rename-variable, replace-temp-with-query, split-variable, replace-magic-literal, encapsulate-variable, encapsulate-record, encapsulate-collection, replace-primitive-with-object, change-reference-to-value, change-value-to-reference, replace-derived-variable-with-query, rename-field

**Statements:** slide-statements, remove-dead-code, introduce-assertion, replace-control-flag-with-break, substitute-algorithm

**Functions:** extract-function, inline-function, change-function-declaration, parameterize-function, remove-flag-argument, move-statements-into-function, move-statements-to-callers, replace-inline-code-with-function-call, combine-functions-into-transform, split-phase, split-loop, replace-loop-with-pipeline, separate-query-from-modifier, replace-parameter-with-query, replace-query-with-parameter, preserve-whole-object, introduce-parameter-object, remove-setting-method, replace-function-with-command, replace-command-with-function, return-modified-value, combine-functions-into-class, replace-error-code-with-exception, replace-exception-with-precheck, move-function

**Conditionals:** consolidate-conditional-expression, decompose-conditional, replace-nested-conditional-with-guard-clauses, replace-conditional-with-polymorphism, introduce-special-case

**Classes:** extract-class, inline-class, move-field, hide-delegate, remove-middle-man, extract-superclass, collapse-hierarchy, pull-up-method, pull-up-field, pull-up-constructor-body, push-down-method, push-down-field, remove-subclass, replace-subclass-with-delegate, replace-superclass-with-delegate, replace-constructor-with-factory-function, replace-type-code-with-subclasses

</details>

## Using with Claude Code / OpenCode

Add this to your project's `CLAUDE.md`, `.opencode/instructions.md`, or `AGENTS.md`:

```markdown
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
```

## AGENTS.md

Instructions for AI coding agents consuming this tool:

### How the project is scoped

The CLI uses `tsconfig.json` to define the project boundary. The `include` and `exclude` fields in `tsconfig.json` determine which source files are in scope for refactoring — only files matched by the tsconfig are loaded, searchable, and refactorable. This means the tsconfig controls both type-checking and the refactoring scope.

### Project resolution and `--path`

The CLI walks up the directory tree from `cwd` to find the nearest `tsconfig.json`. This works automatically for single-project repos — you can run `refactor` from any subdirectory.

Use `--path <dir>` to explicitly set the starting directory for tsconfig resolution. The CLI will look for `tsconfig.json` in that directory first, then walk up from there. Use `--config <file>` to point at a specific tsconfig file directly.

**In monorepos with multiple `tsconfig.json` files, always pass `--path` to target the correct package root.** Without it, the CLI may pick a parent tsconfig that includes more files than intended.

```bash
# Monorepo: always be explicit
refactor --path packages/api apply extract-variable file=src/app.ts target="x + 1" name=total
```

### Persistent server

The CLI runs a background daemon that keeps the parsed TypeScript AST in memory. The daemon is identified by the resolved project root (the directory containing the `tsconfig.json` that was found). In a monorepo, different `--path` values that resolve to different tsconfigs will spawn separate daemons.

## License

MIT
