## Purpose
Run Python fixture tests within the existing vitest suite, verifying semantic preservation and structural change for Python refactorings.

## Requirements

### Requirement: Fixture discovery
The system SHALL discover `.fixture.py` files and fixture directories following the same convention as TypeScript fixtures.

#### Scenario: Single-file fixture discovered
- **WHEN** a `.fixture.py` file exists in a refactoring's `fixtures/` directory
- **THEN** it is discovered and included in the test run

#### Scenario: Multi-file fixture directory discovered
- **WHEN** a fixture directory containing `entry.py` and supporting modules exists
- **THEN** the directory is discovered as a single multi-file fixture

### Requirement: Fixture execution and semantic verification
The system SHALL execute Python fixtures via subprocess and verify that refactoring preserves semantics.

#### Scenario: Semantic preservation verified
- **WHEN** a Python fixture test runs
- **THEN** the harness runs `main()` before and after the refactoring and asserts the outputs are identical

#### Scenario: Structural change verified
- **WHEN** a Python fixture test runs
- **THEN** the harness asserts that the source text changed (not a no-op)

#### Scenario: Params provided by fixture
- **WHEN** a fixture exports a module-level `params` dict
- **THEN** the test runner uses those params when applying the refactoring

### Requirement: Integration with vitest suite
The Python fixture runner SHALL run within the existing vitest test suite.

#### Scenario: Runs alongside TypeScript fixtures
- **WHEN** the test suite runs
- **THEN** `all-python-fixtures.test.ts` executes in parallel with `all-fixtures.test.ts`
