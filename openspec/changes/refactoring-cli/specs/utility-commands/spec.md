## ADDED Requirements

### Requirement: Search for entities by symbol identity
`refactor search <entity>` SHALL find all occurrences of a symbol resolved by the TypeScript type checker, not by name string matching. Two functions named `parse` in different modules are different entities.

#### Scenario: Search by name
- **WHEN** user runs `refactor search calculateTotal --json`
- **THEN** output contains all declarations and usages of the symbol(s) named `calculateTotal`, grouped by unique symbol identity, with file path and line numbers

#### Scenario: Search with kind filter
- **WHEN** user runs `refactor search parse --kind function --json`
- **THEN** output contains only function declarations named `parse`, excluding interfaces, variables, etc.

#### Scenario: Search with --exported filter
- **WHEN** user runs `refactor search MyType --exported --json`
- **THEN** output contains only exported symbols named `MyType`

#### Scenario: No matches
- **WHEN** user runs `refactor search nonexistentSymbol --json`
- **THEN** output is `{ success: true, data: { results: [] } }`

### Requirement: Find all references of an entity
`refactor references <entity>` SHALL find all usages of a symbol: imports, call sites, type references, assignments.

#### Scenario: Find references
- **WHEN** user runs `refactor references calculateTotal --json`
- **THEN** output contains all files and locations where the symbol is used, categorized by usage type (import, call, type reference, assignment)

#### Scenario: Transitive references
- **WHEN** user runs `refactor references calculateTotal --transitive --json`
- **THEN** output includes indirect references (callers of callers)

#### Scenario: Kind filter
- **WHEN** user runs `refactor references parse --kind function --json`
- **THEN** output contains references only for function `parse`, not interface `parse`

### Requirement: Find unused symbols
`refactor unused` SHALL detect symbols that are declared but never referenced within the project scope.

#### Scenario: Find all unused
- **WHEN** user runs `refactor unused --json`
- **THEN** output lists all unused symbols with their declaration location, kind, and whether they are exported

#### Scenario: Filter by kind
- **WHEN** user runs `refactor unused --kind function --json`
- **THEN** output lists only unused functions

#### Scenario: Ignore test files
- **WHEN** user runs `refactor unused --ignore-tests --json`
- **THEN** symbols used only in test files are reported as unused

### Requirement: Fix broken imports
`refactor fix-imports` SHALL detect and optionally fix missing or broken import statements.

#### Scenario: List broken imports
- **WHEN** user runs `refactor fix-imports --list --json`
- **THEN** output lists all files with broken imports and what's missing

#### Scenario: Auto-fix unambiguous imports
- **WHEN** user runs `refactor fix-imports --auto --json`
- **THEN** the system fixes imports where there is exactly one candidate and reports changes

#### Scenario: Ambiguous import
- **WHEN** a broken import has multiple possible sources
- **THEN** the system reports the ambiguity with candidates but does not auto-fix
