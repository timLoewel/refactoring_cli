## ADDED Requirements

### Requirement: Auto-discover fixture tests
The system SHALL automatically discover and run fixture tests for all refactoring modules that have a `fixtures/` directory.

#### Scenario: Single-file fixture discovered and tested
- **WHEN** `src/refactorings/extract-variable/fixtures/basic.fixture.ts` exists
- **THEN** a test case is generated that applies the extract-variable refactoring and verifies semantic preservation

#### Scenario: Multiple fixtures per refactoring
- **WHEN** a refactoring has `fixtures/basic.fixture.ts` and `fixtures/edge-case.fixture.ts`
- **THEN** both fixtures are discovered and tested independently

#### Scenario: Refactoring without fixtures
- **WHEN** a refactoring module has no `fixtures/` directory
- **THEN** no test is generated for that refactoring (no error)

#### Scenario: Test output reports per-fixture results
- **WHEN** the auto-discovered tests run
- **THEN** Jest output shows `describe("Extract Variable") > it("preserves semantics: basic")` for each fixture

### Requirement: Fixture params convention
Each fixture file MAY export a `params` object that provides the parameters needed to apply the refactoring to itself.

#### Scenario: Fixture provides params
- **WHEN** a fixture exports `export const params = { file: "fixture.ts", target: "x + y", name: "total" }`
- **THEN** the auto-test uses those params when applying the refactoring

#### Scenario: Fixture without params
- **WHEN** a fixture does not export `params`
- **THEN** the test is skipped with a clear message (not failed)
