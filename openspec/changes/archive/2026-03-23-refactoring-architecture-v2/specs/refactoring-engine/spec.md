## MODIFIED Requirements

### Requirement: RefactoringResult no longer includes diff
**BREAKING**: The `diff` field is removed from `RefactoringResult`. The engine computes diffs from before/after snapshots.

#### Scenario: Refactoring returns result without diff
- **WHEN** a refactoring's apply function returns
- **THEN** the result contains `success`, `filesChanged`, and `description` but no `diff` field

#### Scenario: Engine still provides diffs to CLI
- **WHEN** `applyRefactoring()` completes successfully
- **THEN** the engine computes diffs from snapshots and includes them in the CLI output envelope, not in the refactoring result

### Requirement: Simplified ParamSchema
`ParamSchema` is no longer generic. The `validate` function returns `unknown` and callers cast as needed.

#### Scenario: ParamSchema has no generic parameter
- **WHEN** a `ParamSchema` is defined
- **THEN** it uses the non-generic interface with `validate: (raw: unknown) => unknown`
