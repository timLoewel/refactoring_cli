## MODIFIED Requirements

### Requirement: Refactoring definition interface
Each refactoring SHALL implement a `RefactoringDefinition` interface with: name, kebabName, description, tier, typed parameter schema, precondition checker, and apply function. The interface SHALL NOT include a `language` field.

#### Scenario: Refactoring is registered
- **WHEN** the CLI starts
- **THEN** all TypeScript refactorings are discovered and available via the registry

#### Scenario: Parameter schema is introspectable
- **WHEN** an agent calls `describe <refactoring> --json`
- **THEN** it receives the full parameter schema with types, descriptions, and required/optional flags

### Requirement: Refactoring registry
The system SHALL maintain a registry of all refactorings, discoverable by name or kebab-name, filterable by tier. The registry SHALL NOT support language-based filtering.

#### Scenario: Lookup by kebab-name
- **WHEN** the system looks up "extract-function"
- **THEN** it returns the Extract Function refactoring definition

#### Scenario: List by tier
- **WHEN** the system lists refactorings filtered by tier 2
- **THEN** it returns all tier 2 refactoring definitions

## REMOVED Requirements

### Requirement: Python project context globals
**Reason**: Python support removed entirely. `setPythonContext`/`getPythonContext` and `PythonProjectContext` no longer needed.
**Migration**: Delete all call sites. No replacement needed.
