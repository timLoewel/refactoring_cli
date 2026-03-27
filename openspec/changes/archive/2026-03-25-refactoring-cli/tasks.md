## 1. Project Setup

- [x] 1.1 Initialize npm package with TypeScript (tsconfig.json strict mode, ES2022 target, declaration files)
- [x] 1.2 Configure ESLint with strict rules (warnings-as-errors, most rules enabled, @typescript-eslint/strict)
- [x] 1.3 Configure Prettier (integrated with ESLint via eslint-config-prettier)
- [x] 1.4 Configure Jest with ts-jest (90% coverage thresholds for branches, functions, lines, statements)
- [x] 1.5 Configure Husky + lint-staged pre-commit hooks (lint-staged runs eslint, prettier, jest --findRelatedTests)
- [x] 1.6 Add roam quality gates to pre-commit (roam health, roam diff checks)
- [x] 1.7 Create bin entry point and configure package.json for `refactor` CLI command

## 2. Project Model

- [x] 2.1 Implement project loader (tsconfig.json resolution: --config flag, --path flag, cwd fallback)
- [x] 2.2 Implement .refactorignore parser (gitignore syntax, default exclusions: node_modules, dist, build)
- [x] 2.3 Implement source file resolver (intersection of tsconfig includes and .refactorignore excludes)
- [x] 2.4 Tests for project model (tsconfig loading, ignore file, file resolution)

## 3. CLI Framework

- [x] 3.1 Set up commander.js with global options (--path, --config, --json, --version, --help)
- [x] 3.2 Implement JSON output envelope ({ success, command, data, errors, warnings })
- [x] 3.3 Register all subcommands (apply, list, describe, search, references, unused, fix-imports, help)
- [x] 3.4 Error handling (unknown commands, missing args, invalid options → JSON error responses)
- [x] 3.5 Tests for CLI framework (global options, error handling, JSON envelope)

## 4. Refactoring Engine

- [x] 4.1 Define RefactoringDefinition interface (name, kebabName, description, tier, params, preconditions, apply)
- [x] 4.2 Define ParamSchema interface (definitions, validate function, JSON-serializable schema)
- [x] 4.3 Define RefactoringResult interface (success, filesChanged, description, diff)
- [x] 4.4 Implement refactoring registry (auto-discovery, lookup by name/kebab-name, filter by tier)
- [x] 4.5 Implement precondition framework (composable checks, clear error messages)
- [x] 4.6 Implement dry-run mode (apply transformation in memory, return diffs, don't write)
- [x] 4.7 Implement atomic apply (write all files or none on error)
- [x] 4.8 Tests for refactoring engine (registry, preconditions, dry-run, atomic apply)

## 5. Symbol Resolver

- [x] 5.1 Implement entity search by symbol identity (type-checker resolved, not string matching)
- [x] 5.2 Implement --kind filter (function, class, variable, interface, type, enum)
- [x] 5.3 Implement --exported filter
- [x] 5.4 Implement reference finder (imports, call sites, type references, assignments)
- [x] 5.5 Implement --transitive references (callers of callers)
- [x] 5.6 Implement unused symbol detection
- [x] 5.7 Implement --ignore-tests filter for unused detection
- [x] 5.8 Tests for symbol resolver (search, references, unused, filters)

## 6. Utility Commands

- [x] 6.1 Implement `refactor search` command (wires CLI to symbol resolver)
- [x] 6.2 Implement `refactor references` command
- [x] 6.3 Implement `refactor unused` command
- [x] 6.4 Implement `refactor fix-imports` command (detect broken imports, --list, --auto)
- [x] 6.5 Tests for utility commands (integration tests with sample projects)

## 7. Discovery Commands

- [x] 7.1 Implement `refactor list` command (all 66 refactorings, --tier filter, --json)
- [x] 7.2 Implement `refactor describe` command (parameter schema, preconditions, example)
- [x] 7.3 Implement `refactor help` command (usage guide with examples for all commands)
- [x] 7.4 Tests for discovery commands

## 8. Test Harness

- [x] 8.1 Implement fixture runner (compile original, run, capture stdout)
- [x] 8.2 Implement refactored fixture runner (copy to ts-morph in-memory project, apply, compile, run)
- [x] 8.3 Implement output comparison (before vs after stdout equality)
- [x] 8.4 Implement structural change verification (detect no-ops)
- [x] 8.5 Support single-file fixtures (.fixture.ts with export main(): string)
- [x] 8.6 Support multi-file fixtures (directory with tsconfig.json, entry.ts, multiple .ts files — verify all files compile, not just entry)
- [x] 8.7 Implement fixture auto-discovery (find all .fixture.ts files and fixture directories in fixtures/ dir)
- [x] 8.8 Tests for test harness itself (meta-tests verifying the harness works)

## 9. Apply Command

- [x] 9.1 Implement `refactor apply <name>` command (lookup refactoring, parse params, run preconditions, apply)
- [x] 9.2 Wire --dry-run flag
- [x] 9.3 Wire --json output with diffs
- [x] 9.4 Tests for apply command (end-to-end with a simple refactoring)

## 10. Tier 1 Refactorings — Variable & Expression (local scope)

Each task includes: implementation, LLM description, single-file fixtures. Rename Variable also requires multi-file fixtures (cross-file rename).

- [x] 10.1 Extract Variable
- [x] 10.2 Inline Variable
- [x] 10.3 Rename Variable (includes multi-file fixtures for codebase-wide rename)
- [x] 10.4 Replace Temp with Query
- [x] 10.5 Split Variable
- [x] 10.6 Replace Magic Literal
- [x] 10.7 Slide Statements
- [x] 10.8 Remove Dead Code
- [x] 10.9 Introduce Assertion
- [x] 10.10 Return Modified Value
- [x] 10.11 Replace Control Flag with Break

## 11. Tier 2 Refactorings — Function level

Each task includes: implementation, LLM description, single-file fixtures. Move Statements into/to Callers and Change Function Declaration require multi-file fixtures for cross-file call site updates.

- [x] 11.1 Extract Function
- [x] 11.2 Inline Function
- [x] 11.3 Change Function Declaration
- [x] 11.4 Parameterize Function
- [x] 11.5 Remove Flag Argument
- [x] 11.6 Move Statements into Function
- [x] 11.7 Move Statements to Callers
- [x] 11.8 Replace Inline Code with Function Call
- [x] 11.9 Combine Functions into Transform
- [x] 11.10 Split Phase
- [x] 11.11 Split Loop
- [x] 11.12 Replace Loop with Pipeline
- [x] 11.13 Consolidate Conditional Expression
- [x] 11.14 Decompose Conditional
- [x] 11.15 Replace Nested Conditional with Guard Clauses
- [x] 11.16 Replace Conditional with Polymorphism
- [x] 11.17 Introduce Special Case
- [x] 11.18 Separate Query from Modifier
- [x] 11.19 Replace Parameter with Query
- [x] 11.20 Replace Query with Parameter
- [x] 11.21 Preserve Whole Object
- [x] 11.22 Introduce Parameter Object
- [x] 11.23 Remove Setting Method
- [x] 11.24 Replace Function with Command
- [x] 11.25 Replace Command with Function
- [x] 11.26 Replace Error Code with Exception
- [x] 11.27 Replace Exception with Precheck
- [x] 11.28 Replace Derived Variable with Query
- [x] 11.29 Substitute Algorithm

## 12. Tier 3 Refactorings — Class & Object (cross-file, type-aware)

Each task includes: implementation, LLM description, single-file AND multi-file fixtures. All Tier 3 refactorings are cross-file by nature and MUST have multi-file fixture tests verifying imports, references, and type integrity across files.

- [x] 12.1 Extract Class
- [x] 12.2 Inline Class
- [x] 12.3 Move Function
- [x] 12.4 Move Field
- [x] 12.5 Encapsulate Record
- [x] 12.6 Encapsulate Variable
- [x] 12.7 Encapsulate Collection
- [x] 12.8 Replace Primitive with Object
- [x] 12.9 Change Reference to Value
- [x] 12.10 Change Value to Reference
- [x] 12.11 Hide Delegate
- [x] 12.12 Remove Middle Man
- [x] 12.13 Combine Functions into Class
- [x] 12.14 Rename Field

## 13. Tier 4 Refactorings — Inheritance (hierarchy manipulation)

Each task includes: implementation, LLM description, single-file AND multi-file fixtures. All Tier 4 refactorings manipulate class hierarchies and MUST have multi-file fixture tests verifying that subclass/superclass relationships, imports, and polymorphic call sites remain correct across files.

- [x] 13.1 Extract Superclass
- [x] 13.2 Collapse Hierarchy
- [x] 13.3 Pull Up Method
- [x] 13.4 Pull Up Field
- [x] 13.5 Pull Up Constructor Body
- [x] 13.6 Push Down Method
- [x] 13.7 Push Down Field
- [x] 13.8 Remove Subclass
- [x] 13.9 Replace Subclass with Delegate
- [x] 13.10 Replace Superclass with Delegate
- [x] 13.11 Replace Constructor with Factory Function
- [x] 13.12 Replace Type Code with Subclasses
