## ADDED Requirements

### Requirement: Shared declaration iteration
`symbol-resolver.ts` SHALL provide a shared iteration mechanism (generator or helper) that eliminates the duplicated source-file/kind/entry loop pattern.

#### Scenario: searchSymbols uses shared iteration
- **WHEN** `searchSymbols` is implemented
- **THEN** it SHALL use the shared iteration mechanism instead of inline triple-nested loops

#### Scenario: findDeclarationNodes uses shared iteration
- **WHEN** `findDeclarationNodes` is implemented
- **THEN** it SHALL use the shared iteration mechanism instead of inline triple-nested loops

### Requirement: All flagged functions below complexity threshold
All functions in `symbol-resolver.ts` SHALL have cognitive complexity below 15.

#### Scenario: searchSymbols complexity
- **WHEN** `searchSymbols` cognitive complexity is measured
- **THEN** it SHALL be less than 15 (currently 26)

#### Scenario: findUnused complexity
- **WHEN** `findUnused` cognitive complexity is measured
- **THEN** it SHALL be less than 15 (currently 19)

#### Scenario: findDeclarationNodes complexity
- **WHEN** `findDeclarationNodes` cognitive complexity is measured
- **THEN** it SHALL be less than 15 (currently 16)

#### Scenario: collectTransitiveRefs complexity
- **WHEN** `collectTransitiveRefs` cognitive complexity is measured
- **THEN** it SHALL be less than 15 (currently 15)

### Requirement: No behavioral changes
All existing tests for symbol-resolver functionality SHALL continue to pass without modification.

#### Scenario: Existing tests pass
- **WHEN** the test suite is run after refactoring
- **THEN** all existing symbol-resolver tests SHALL pass
