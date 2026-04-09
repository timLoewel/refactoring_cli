## Why

The codebase uses thrown exceptions for both expected failures (precondition violations, invalid params, missing files) and unexpected errors. This makes error flows invisible at call sites — callers must remember to try/catch, and nothing in the type system enforces it. Adopting `neverthrow` makes error paths explicit in return types, eliminating a whole class of bugs from unhandled exceptions.

## What Changes

- **Add `neverthrow` as a runtime dependency** for `Result<T, E>` and `ResultAsync<T, E>` types
- **Add `eslint-plugin-functional`** with `configs.noExceptions` to lint-forbid `throw` statements and `try/catch` in production code
- **Add `eslint-plugin-neverthrow`** to enforce that `Result` values are always consumed (no silently ignored errors)
- **BREAKING: Refactor core APIs to return `Result` types** instead of throwing:
  - `refactoring-builder.ts` param validation (8 throw sites) → return `Result`
  - `project-model.ts` tsconfig resolution (2 throw sites) → return `Result`
  - `refactoring-registry.ts` duplicate registration → return `Result`
  - `refactor-client.ts` daemon connection → return `Result`
  - `apply.ts` — already uses error-value returns; align with `Result` type
- **Refactor `fixture-runner.ts`** (6 throw sites) → return `Result` for test infrastructure errors
- **Exempt fixture files and test assertions** from the no-exceptions ESLint rule (fixture input code legitimately contains throw/try-catch as test subjects; test helpers may use throw for assertion failures)
- **Define named Result type aliases** per domain (e.g. `type ParamResult<T> = Result<T, ParamError>`, `type ProjectResult<T> = Result<T, ProjectError>`) so return types are self-documenting and encode intent without verbose generics
- **Add a CLAUDE.md paragraph** prescribing neverthrow usage conventions so AI agents and contributors follow the same error-handling patterns

## Capabilities

### New Capabilities
- `neverthrow-error-handling`: Covers the Result type conventions, error type hierarchy, and ESLint enforcement rules for the codebase

### Modified Capabilities
- `refactoring-builder`: Param validation now returns `Result` instead of throwing — changes the contract for how refactorings define and validate parameters
- `project-model`: `createProject` / tsconfig resolution returns `Result` instead of throwing — changes how callers handle missing config

## Impact

- **Dependencies**: +3 new packages (`neverthrow`, `eslint-plugin-functional`, `eslint-plugin-neverthrow`)
- **Core modules affected**: `refactoring-builder.ts`, `project-model.ts`, `apply.ts`, `refactoring-registry.ts`, `refactor-client.ts`, `fixture-runner.ts`
- **CLI commands**: All command handlers in `src/core/cli/commands/` that catch errors need updating to match/unwrap Results
- **Refactoring definitions**: Any refactoring that calls param helpers or project-model APIs needs to handle `Result` returns (all ~30 refactorings)
- **Test files**: Tests that assert on thrown errors need updating to assert on `Result.err` values
- **ESLint config**: New plugins and rules added; CI will enforce no-throw in production code
