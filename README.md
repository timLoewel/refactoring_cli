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

## License

MIT
