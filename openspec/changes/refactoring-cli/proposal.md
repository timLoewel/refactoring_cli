## Why

There is no reliable, agent-consumable tool for applying Martin Fowler's catalog of refactorings to TypeScript codebases with **guaranteed semantic preservation**. Agents like Claude Code can edit code, but they lack structured refactoring primitives that are provably safe. A CLI tool that exposes all 66 catalog refactorings as typed, AST-level transformations — with compile-and-run verification — gives agents a vocabulary of safe structural changes.

## What Changes

- New TypeScript CLI project with strict tooling (ESLint warnings-as-errors, Prettier, Jest 90% coverage, husky/lint-staged pre-commit hooks, roam quality gates)
- `refactor` CLI powered by ts-morph, agent-first (JSON output primary)
- 66 refactoring commands from Fowler's catalog, each with typed parameter interfaces, precondition checks, and AST transformations
- Utility commands: `search`, `references`, `unused`, `fix-imports`
- Discovery commands: `list`, `describe`
- Project model: tsconfig-based with `.refactorignore` support
- Test harness: self-contained TS fixture files, compiled and run before/after each refactoring, stdout compared for semantic equivalence

## Capabilities

### New Capabilities

- `project-model`: tsconfig loading, .refactorignore, source file resolution, symbol indexing via ts-morph
- `cli-framework`: commander.js entry point, --json on all commands, global options (--path, --config)
- `discovery-commands`: `list` (catalog with descriptions), `describe` (LLM-friendly per-refactoring detail), `help` (usage guide with examples)
- `utility-commands`: `search` (symbol-resolved entity search with --kind filter), `references` (all usages including transitive), `unused` (dead symbol detection), `fix-imports` (resolve broken imports)
- `refactoring-engine`: base refactoring interface, precondition/postcondition framework, dry-run support, parameter schema introspection
- `test-harness`: fixture runner that compiles+runs before/after, stdout comparison, coverage integration
- `tier1-refactorings`: Extract Variable, Inline Variable, Rename Variable, Replace Temp with Query, Split Variable, Replace Magic Literal, Slide Statements, Remove Dead Code, Introduce Assertion, Return Modified Value, Replace Control Flag with Break
- `tier2-refactorings`: Extract Function, Inline Function, Change Function Declaration, Parameterize Function, Remove Flag Argument, Move Statements into Function, Move Statements to Callers, Replace Inline Code with Function Call, Combine Functions into Transform, Split Phase, Split Loop, Replace Loop with Pipeline, Consolidate Conditional Expression, Decompose Conditional, Replace Nested Conditional with Guard Clauses, Replace Conditional with Polymorphism, Introduce Special Case, Separate Query from Modifier, Replace Parameter with Query, Replace Query with Parameter, Preserve Whole Object, Introduce Parameter Object, Remove Setting Method, Replace Function with Command, Replace Command with Function, Replace Error Code with Exception, Replace Exception with Precheck, Replace Derived Variable with Query, Substitute Algorithm
- `tier3-refactorings`: Extract Class, Inline Class, Move Function, Move Field, Encapsulate Record, Encapsulate Variable, Encapsulate Collection, Replace Primitive with Object, Change Reference to Value, Change Value to Reference, Hide Delegate, Remove Middle Man, Combine Functions into Class, Rename Field, Replace Temp with Query
- `tier4-refactorings`: Extract Superclass, Collapse Hierarchy, Pull Up Method, Pull Up Field, Pull Up Constructor Body, Push Down Method, Push Down Field, Remove Subclass, Replace Subclass with Delegate, Replace Superclass with Delegate, Replace Constructor with Factory Function, Replace Type Code with Subclasses

### Modified Capabilities

_(none — greenfield project)_

## Impact

- New npm package: `refactoring-cli`
- Dependencies: ts-morph, commander, typescript
- Dev dependencies: eslint, prettier, jest, ts-jest, husky, lint-staged
- Targets TypeScript codebases only (requires tsconfig.json in target project)
