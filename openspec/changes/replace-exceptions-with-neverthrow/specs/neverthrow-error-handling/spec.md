## ADDED Requirements

### Requirement: Error type hierarchy
The system SHALL define domain error types as plain objects with a `kind` discriminant in `src/core/errors.ts`. The error types SHALL be: `ParamError`, `ProjectError`, `RegistryError`, `ConnectionError`, and `FixtureError`. A union type `CoreError` SHALL combine all non-test error types.

#### Scenario: ParamError for invalid parameter
- **WHEN** a param validator receives an invalid value
- **THEN** it returns `err({ kind: "param", param: "<name>", message: "<reason>" })`

#### Scenario: ProjectError for missing tsconfig
- **WHEN** tsconfig resolution fails
- **THEN** it returns `err({ kind: "project", message: "<reason>" })`

#### Scenario: RegistryError for duplicate registration
- **WHEN** a refactoring with the same kebab name is registered twice
- **THEN** it returns `err({ kind: "registry", message: "<reason>" })`

#### Scenario: ConnectionError for daemon failure
- **WHEN** the daemon connection cannot be established
- **THEN** it returns `errAsync({ kind: "connection", message: "<reason>" })`

#### Scenario: FixtureError for test infrastructure
- **WHEN** a fixture file is malformed (no entry.ts, no main() export)
- **THEN** it returns `err({ kind: "fixture", message: "<reason>" })`

### Requirement: Named Result type aliases
The system SHALL define named Result type aliases in `src/core/errors.ts` following the pattern `type XResult<T> = Result<T, XError>`. Each domain error type SHALL have a corresponding named Result alias.

#### Scenario: ParamResult alias
- **WHEN** a param validation function declares its return type
- **THEN** it uses `ParamResult<T>` instead of `Result<T, ParamError>`

#### Scenario: ProjectResult alias
- **WHEN** a project loading function declares its return type
- **THEN** it uses `ProjectResult<T>` instead of `Result<T, ProjectError>`

#### Scenario: ConnectionResult as async alias
- **WHEN** an async connection function declares its return type
- **THEN** it uses `ConnectionResult<T>` which maps to `ResultAsync<T, ConnectionError>`

### Requirement: ESLint no-exceptions enforcement
The system SHALL configure `eslint-plugin-functional` with `configs.noExceptions` to forbid `throw` statements and `try/catch` blocks in production code.

#### Scenario: Throw in production code fails lint
- **WHEN** a `throw` statement exists in a `.ts` file under `src/` (not test or fixture)
- **THEN** ESLint reports a `functional/no-throw-statements` error

#### Scenario: Try-catch in production code fails lint
- **WHEN** a `try/catch` block exists in a `.ts` file under `src/` (not test or fixture)
- **THEN** ESLint reports a `functional/no-try-statements` error

#### Scenario: Test files exempt
- **WHEN** a `throw` or `try/catch` exists in a `*.test.ts` file
- **THEN** ESLint does not report an error

#### Scenario: Fixture files exempt
- **WHEN** a `throw` or `try/catch` exists in a `*.fixture.ts` file
- **THEN** ESLint does not report an error

#### Scenario: Boundary files exempt
- **WHEN** a `try/catch` exists in `src/core/cli/commands/*.ts` or `src/core/server/*.ts`
- **THEN** ESLint does not report an error (these are system boundaries)

### Requirement: ESLint Result consumption enforcement
The system SHALL configure `eslint-plugin-neverthrow` to ensure all `Result` values are consumed (not silently ignored).

#### Scenario: Unused Result fails lint
- **WHEN** a function returns a `Result` and the caller does not use the return value
- **THEN** ESLint reports a `neverthrow/must-use-result` error

#### Scenario: Consumed Result passes lint
- **WHEN** a `Result` is unwrapped, matched, chained, or assigned
- **THEN** ESLint does not report an error

### Requirement: CLAUDE.md error handling conventions
The project CLAUDE.md SHALL contain a short paragraph documenting the neverthrow conventions: use `Result` types for expected failures, import named types from `src/core/errors.ts`, exceptions only at system boundaries.

#### Scenario: CLAUDE.md contains error handling section
- **WHEN** a contributor or AI agent reads the project CLAUDE.md
- **THEN** they find an "Error Handling" section under Coding Conventions prescribing neverthrow usage

### Requirement: neverthrow dependency
The system SHALL add `neverthrow` as a runtime dependency, `eslint-plugin-functional` and `eslint-plugin-neverthrow` as dev dependencies.

#### Scenario: Package dependencies
- **WHEN** `package.json` is inspected
- **THEN** `neverthrow` is in `dependencies` and `eslint-plugin-functional` and `eslint-plugin-neverthrow` are in `devDependencies`
