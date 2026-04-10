## Context

The codebase has 39 throw sites across 22 files and 13 catch sites across 10 files. Errors fall into two categories:

1. **Expected failures** — invalid params, missing tsconfig, file not found, precondition violations. These are normal control flow and should be typed.
2. **Unexpected failures** — daemon socket errors, JSON parse failures, disk I/O. These are exceptional and rare.

The existing `ResolveResult<T>` discriminated union in `refactoring-builder.ts` already models the right pattern for category 1. The `apply.ts` module already uses error-value returns via `tryApply`/`trySave`. These ad-hoc patterns should be unified under `neverthrow`'s `Result<T, E>`.

The `RefactorClient` class uses `Promise`-based rejection for connection/protocol errors — these map to `ResultAsync<T, E>`.

## Goals / Non-Goals

**Goals:**
- Every function that can fail for expected reasons returns `Result<T, E>` or `ResultAsync<T, E>`
- Named Result type aliases per domain (`ParamResult<T>`, `ProjectResult<T>`, etc.) for self-documenting signatures
- ESLint enforces no `throw`/`try-catch` in production code via `eslint-plugin-functional`
- ESLint enforces Result consumption via `eslint-plugin-neverthrow` (no silently dropped errors)
- CLAUDE.md documents the neverthrow conventions for contributors and AI agents

**Non-Goals:**
- Refactoring the `RefactoringResult` type itself (it already uses `success: boolean` — changing it to `Result` would be a separate change with massive blast radius across all 30+ refactoring definitions)
- Wrapping third-party APIs (ts-morph, commander) in Result types — they throw by design, catch at boundaries
- Eliminating `try/catch` entirely — daemon JSON parsing and socket handlers are legitimate catch-at-boundary sites

## Decisions

### 1. Error type hierarchy

Define a small set of domain error types rather than using bare `Error` or strings:

```typescript
// src/core/errors.ts
interface ParamError { kind: "param"; param: string; message: string }
interface ProjectError { kind: "project"; message: string }
interface RegistryError { kind: "registry"; message: string }
interface ConnectionError { kind: "connection"; message: string }
interface FixtureError { kind: "fixture"; message: string }

type CoreError = ParamError | ProjectError | RegistryError | ConnectionError
```

Plain objects with `kind` discriminants — no Error subclasses. This keeps them serializable and pattern-matchable.

**Alternative considered:** Using `Error` subclasses — rejected because `instanceof` checks are fragile across module boundaries and Error objects carry unnecessary stack traces for expected failures.

### 2. Named Result type aliases

Following the neverthrow wiki pattern, define domain-specific aliases:

```typescript
// src/core/errors.ts
type ParamResult<T> = Result<T, ParamError>
type ProjectResult<T> = Result<T, ProjectError>
type RegistryResult<T> = Result<T, RegistryError>
type ConnectionResult<T> = ResultAsync<T, ConnectionError>
```

These go in a single `errors.ts` module alongside the error types.

**Alternative considered:** Colocating each type with its module — rejected because a central errors module makes imports simpler and keeps the error hierarchy visible in one place.

### 3. Migration strategy: inside-out by module

Migrate in dependency order (leaves first, dependents after):

1. `refactoring-builder.ts` param validators — replace `throw` with `err()`
2. `project-model.ts` — replace `throw` with `err()`
3. `refactoring-registry.ts` — replace `throw` with `err()`
4. `apply.ts` — replace ad-hoc `tryApply`/`trySave` with `Result.fromThrowable`
5. `refactor-client.ts` — replace throw/reject with `ResultAsync`
6. CLI command handlers — unwrap Results at the boundary
7. `fixture-runner.ts` — replace throws with `Result`

Each module is a self-contained migration. The existing `ResolveResult<T>` in refactoring-builder.ts gets replaced by `Result<T, CoreError>`.

**Alternative considered:** Big-bang migration — rejected because incremental per-module changes are reviewable and testable independently.

### 4. Boundary handling: catch at edges only

`try/catch` remains allowed at system boundaries:
- CLI command `action` handlers (commander callbacks) — catch unexpected errors, format for user output
- Daemon socket/JSON parsing — protocol-level error handling
- `apply.ts` wrapping `definition.apply()` — third-party refactoring code can still throw

Use `Result.fromThrowable()` to wrap calls that cross into throwing code (e.g., `project.saveSync()`).

### 5. ESLint configuration

```javascript
// eslint.config.mjs additions
import functional from "eslint-plugin-functional";
import neverthrowPlugin from "eslint-plugin-neverthrow";

// In the main config:
functional.configs.noExceptions,  // forbids throw, try/catch
neverthrowPlugin.configs.recommended,  // enforces Result consumption

// Override for files that legitimately need exceptions:
{
  files: ["**/*.test.ts", "**/*.fixture.ts", "src/core/cli/commands/*.ts", "src/core/server/*.ts"],
  rules: {
    "functional/no-throw-statements": "off",
    "functional/no-try-statements": "off",
  },
},
```

CLI commands and server code get an override because they sit at system boundaries where catch-and-format is the right pattern.

**Alternative considered:** No ESLint enforcement, rely on convention — rejected because the whole point is compile-time guarantees. Without lint rules, throw statements will creep back.

### 6. CLAUDE.md addition

Add a short paragraph to the project CLAUDE.md under Coding Conventions:

```markdown
## Error Handling

Use `neverthrow` Result types for all expected failure paths. Never throw exceptions for
expected errors — return `err()` instead. Import named Result types from `src/core/errors.ts`.
Exceptions are only acceptable at system boundaries (CLI handlers, daemon socket parsing).
```

## Risks / Trade-offs

- **[Verbosity]** → Result chaining (`.andThen`, `.map`) is more verbose than throw/catch for simple cases. Mitigated by named type aliases and neverthrow's fluent API.
- **[Learning curve]** → Contributors unfamiliar with Result types need to learn the pattern. Mitigated by CLAUDE.md docs and ESLint errors guiding them.
- **[Third-party interop]** → ts-morph throws exceptions internally. `Result.fromThrowable()` wraps these at the boundary, adding a small layer. Acceptable since we already wrap in `tryApply`.
- **[Fixture files exempt]** → Fixture input code is user-provided TypeScript that intentionally uses throw/try-catch. The ESLint override for `*.fixture.ts` is correct — these are test subjects, not our code.
- **[Breaking ParamSchema.validate signature]** → Changing `validate` from throwing to returning `Result` is a breaking change to `ParamSchema` interface. All refactoring definitions go through `defineRefactoring` which handles this internally, so the blast radius is contained to `refactoring-builder.ts`.
