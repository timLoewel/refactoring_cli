## Purpose

Defines the core refactoring engine: definition interface, precondition checking, apply/dry-run modes, registry, type inference, and generic type parameter handling.

## Requirements

### Requirement: Refactoring definition interface
Each refactoring SHALL implement a `RefactoringDefinition` interface with: name, kebabName, description, tier, typed parameter schema, precondition checker, and apply function. The interface SHALL NOT include a `language` field.

#### Scenario: Refactoring is registered
- **WHEN** the CLI starts
- **THEN** all TypeScript refactorings are discovered and available via the registry

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
The system SHALL maintain a registry of all refactorings, discoverable by name or kebab-name, filterable by tier. The registry SHALL NOT support language-based filtering.

#### Scenario: Lookup by kebab-name
- **WHEN** the system looks up "extract-function"
- **THEN** it returns the Extract Function refactoring definition

#### Scenario: List by tier
- **WHEN** the system lists refactorings filtered by tier 2
- **THEN** it returns all tier 2 refactoring definitions

### Requirement: Context-relative type printing
All refactorings that generate type annotations SHALL use `type.getText(node)` for context-relative type resolution. This produces short import names (e.g., `DataSource`) instead of fully-qualified paths (e.g., `import("/path/to/module").DataSource`).

#### Scenario: Imported type printed as short name
- **WHEN** a refactoring extracts a function whose parameter type is an imported class
- **THEN** the generated type annotation uses the short class name, not the `import()` path

#### Scenario: Truly unresolvable type falls back to unknown
- **WHEN** `getText(node)` returns an empty string or an anonymous type
- **THEN** the refactoring falls back to `unknown` as the type annotation

### Requirement: Generic type parameter propagation
Refactorings that extract functions from generic contexts SHALL carry type parameters to the extracted function when the extracted code references them.

#### Scenario: Extracted function preserves generic
- **WHEN** decompose-conditional extracts a condition from a generic function `foo<T>(x: T)`
- **THEN** the extracted condition function includes the type parameter `<T>`

#### Scenario: Non-generic extraction omits type params
- **WHEN** the extracted code does not reference any type parameters
- **THEN** no type parameters are added to the extracted function
