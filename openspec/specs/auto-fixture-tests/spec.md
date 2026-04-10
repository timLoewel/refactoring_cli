## Requirements

### Requirement: Fixture discovery

The system SHALL scan `src/refactorings/*/fixtures/` to discover testable fixtures. Two fixture types are supported: single-file and multi-file.

#### Scenario: Single-file fixture discovered

- **WHEN** `src/refactorings/extract-variable/fixtures/basic.fixture.ts` exists
- **THEN** a fixture with type "single" and name "basic" is discovered for "extract-variable"

#### Scenario: Multi-file fixture discovered

- **WHEN** `src/refactorings/move-function/fixtures/arrow-function/entry.ts` exists
- **THEN** a fixture with type "multi" and name "arrow-function" is discovered for "move-function"

#### Scenario: Directory without entry.ts is ignored

- **WHEN** a subdirectory under `fixtures/` exists but contains no `entry.ts`
- **THEN** it is not treated as a fixture

#### Scenario: Refactoring without fixtures directory

- **WHEN** a refactoring module has no `fixtures/` directory
- **THEN** no tests are generated (no error)

#### Scenario: Multiple fixtures per refactoring

- **WHEN** a refactoring has `fixtures/basic.fixture.ts` and `fixtures/edge-case.fixture.ts`
- **THEN** both fixtures are discovered and tested independently

#### Scenario: Nonexistent directory returns empty

- **WHEN** the fixtures directory does not exist
- **THEN** discovery returns an empty list

### Requirement: Fixture params convention

Each fixture MUST export a `params` object providing the parameters needed to apply the refactoring. Params include `file`, `target`, and optionally `name`, `expectRejection`, and refactoring-specific keys.

#### Scenario: Fixture provides params

- **WHEN** a fixture exports `export const params = { file: "fixture.ts", target: "price * 0.1", name: "taxAmount" }`
- **THEN** the test uses those params when applying the refactoring

#### Scenario: Fixture without params fails with helpful error

- **WHEN** a fixture does not export `params`
- **THEN** the test fails with a message instructing the author to add a `params` export

### Requirement: Semantic preservation (standard fixtures)

For fixtures without `expectRejection`, the test verifies that the refactoring modifies code AND preserves runtime behavior.

#### Scenario: Refactoring preserves semantics and changes structure

- **WHEN** a fixture's `main()` returns "3" before refactoring
- **AND** the refactoring modifies the source text
- **AND** `main()` still returns "3" after refactoring
- **THEN** the test passes

#### Scenario: Refactoring is a no-op

- **WHEN** the refactoring produces no textual change to any source file
- **THEN** the test fails with "no-op"

#### Scenario: Refactoring breaks output

- **WHEN** `main()` returns a different value after refactoring
- **THEN** the test fails with "Output mismatch" showing before and after values

#### Scenario: Refactoring introduces compilation errors

- **WHEN** the transformed code has TypeScript compilation errors
- **THEN** the test fails with the compilation error messages

### Requirement: Expected rejection (expectRejection fixtures)

Fixtures with `params.expectRejection = true` verify that the refactoring correctly refuses to apply.

#### Scenario: Precondition rejects (primary check)

- **WHEN** `preconditions(project, params)` returns `ok: false`
- **THEN** the test passes immediately

#### Scenario: Precondition passes but refactoring breaks semantics (fallback)

- **WHEN** `preconditions(project, params)` returns `ok: true`
- **AND** applying the refactoring causes an error or output mismatch
- **THEN** the test passes (semantic corruption caught the problem)

#### Scenario: Precondition passes and refactoring preserves semantics (insufficient precondition)

- **WHEN** `preconditions(project, params)` returns `ok: true`
- **AND** the refactoring applies successfully and preserves semantics
- **THEN** the test fails with "precondition is insufficient"

### Requirement: Single-file execution

Single-file fixtures are transpiled and executed in a sandboxed `Function` context.

#### Scenario: Fixture exports main()

- **WHEN** a single-file fixture exports `main()` returning a string
- **THEN** the runner transpiles to JS and executes `main()` to capture output

#### Scenario: Fixture missing main()

- **WHEN** a single-file fixture does not export `main()`
- **THEN** execution throws an error

### Requirement: Multi-file execution

Multi-file fixtures use ts-morph compilation with a custom module resolver.

#### Scenario: Entry file imports from sibling modules

- **WHEN** `entry.ts` imports from `./source.js`
- **AND** `source.ts` exists in the same directory
- **THEN** the custom require resolves and executes the dependency

#### Scenario: Module cache prevents double execution

- **WHEN** two modules both import the same dependency
- **THEN** the dependency is executed once and the cached exports are reused

#### Scenario: Multi-file fixture missing entry.ts

- **WHEN** a multi-file fixture directory has no `entry.ts`
- **THEN** execution fails with an error

### Requirement: Test result reporting

Each fixture produces a structured result for test reporting.

#### Scenario: Result shape

- **WHEN** a fixture test completes (pass or fail)
- **THEN** the result includes: fixture name, pass/fail status, before output, after output, structural change flag, and optional error message

#### Scenario: Test naming in Jest output

- **WHEN** auto-discovered tests run
- **THEN** standard fixtures appear as `describe("Extract Variable") > it("preserves semantics: basic")`
- **AND** rejection fixtures appear as `describe("Split Loop") > it("rejects precondition: dependent-reject")`

#### Scenario: Unhandled exception during test

- **WHEN** an exception is thrown during fixture execution (outside the expected flow)
- **THEN** the result captures the error message and reports the test as failed
