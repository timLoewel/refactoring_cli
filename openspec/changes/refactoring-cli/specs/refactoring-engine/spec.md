## ADDED Requirements

### Requirement: Refactoring definition interface
Each refactoring SHALL implement a `RefactoringDefinition` interface with: name, kebabName, description, tier, typed parameter schema, precondition checker, and apply function.

#### Scenario: Refactoring is registered
- **WHEN** the CLI starts
- **THEN** all 66 refactorings are discovered and available via the registry

#### Scenario: Parameter schema is introspectable
- **WHEN** an agent calls `describe <refactoring> --json`
- **THEN** it receives the full parameter schema with types, descriptions, and required/optional flags

### Requirement: Precondition checking
Each refactoring SHALL check preconditions before applying. If preconditions fail, no files are modified.

#### Scenario: Precondition passes
- **WHEN** `apply extract-function` is called with valid parameters on a valid target
- **THEN** the refactoring proceeds

#### Scenario: Precondition fails
- **WHEN** `apply extract-function` is called on a target that cannot be extracted (e.g. partial expression)
- **THEN** the system returns `{ success: false, errors: ["...reason..."] }` and no files are changed

### Requirement: Dry-run mode
`refactor apply <name> --dry-run` SHALL show what would change without writing to disk.

#### Scenario: Dry run output
- **WHEN** `apply extract-function --dry-run --json` is called
- **THEN** output contains the diffs that would be applied, but no files are modified

### Requirement: Apply writes to disk
`refactor apply <name>` (without --dry-run) SHALL apply the transformation and write changed files to disk.

#### Scenario: Successful apply
- **WHEN** preconditions pass and the transformation succeeds
- **THEN** changed files are written to disk and the result includes `{ success: true, filesChanged: [...], diff: [...] }`

#### Scenario: Transformation error
- **WHEN** the transformation encounters an unexpected error
- **THEN** no partial changes are written (atomic operation) and the error is reported

### Requirement: Refactoring registry
The system SHALL maintain a registry of all refactorings, discoverable by name or kebab-name, filterable by tier.

#### Scenario: Lookup by kebab-name
- **WHEN** the system looks up "extract-function"
- **THEN** it returns the Extract Function refactoring definition

#### Scenario: List by tier
- **WHEN** the system lists refactorings filtered by tier 2
- **THEN** it returns all tier 2 refactoring definitions
