## ADDED Requirements

### Requirement: No dead exports in engine modules
All exported symbols in `src/engine/` SHALL be imported by at least one production source file (test files do not count as consumers for this purpose).

#### Scenario: Precondition functions are not exported
- **WHEN** `src/engine/preconditions.ts` is analyzed
- **THEN** `runPreconditions`, `fileExists`, `fileCompiles`, `symbolExistsInFile`, and `lineRangeValid` SHALL NOT be exported (or SHALL be removed entirely if unused by tests)

#### Scenario: PreconditionContext is not exported if unused
- **WHEN** `PreconditionContext` interface has no production consumers
- **THEN** it SHALL NOT be exported

#### Scenario: All remaining dead exports are resolved
- **WHEN** `roam dead` is run after cleanup
- **THEN** the number of dead exports SHALL be 0
