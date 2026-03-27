## ADDED Requirements

### Requirement: return-modified-value apply complexity below 20
The `apply` function in `src/refactorings/return-modified-value/index.ts` SHALL have cognitive complexity below 20.

#### Scenario: Complexity after extraction
- **WHEN** the `apply` function cognitive complexity is measured
- **THEN** it SHALL be less than 20 (currently 25)

#### Scenario: Extracted helpers are co-located
- **WHEN** helper functions are extracted
- **THEN** they SHALL remain in the same file (`return-modified-value/index.ts`)

### Requirement: consolidate-conditional-expression apply complexity below 20
The `apply` function in `src/refactorings/consolidate-conditional-expression/index.ts` SHALL have cognitive complexity below 20.

#### Scenario: Complexity after extraction
- **WHEN** the `apply` function cognitive complexity is measured
- **THEN** it SHALL be less than 20 (currently 24)

#### Scenario: Extracted helpers are co-located
- **WHEN** helper functions are extracted
- **THEN** they SHALL remain in the same file (`consolidate-conditional-expression/index.ts`)

### Requirement: No behavioral changes
All existing tests and fixtures for the modified refactorings SHALL continue to pass without modification.

#### Scenario: return-modified-value tests pass
- **WHEN** the test suite is run after refactoring
- **THEN** all return-modified-value tests and fixtures SHALL pass

#### Scenario: consolidate-conditional-expression tests pass
- **WHEN** the test suite is run after refactoring
- **THEN** all consolidate-conditional-expression tests and fixtures SHALL pass
