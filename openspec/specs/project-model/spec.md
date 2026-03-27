## ADDED Requirements

### Requirement: Load TypeScript project via tsconfig.json
The system SHALL load a target TypeScript project by locating and parsing its `tsconfig.json`. It SHALL use ts-morph to create a `Project` instance with full type information.

#### Scenario: Load project from current directory
- **WHEN** the user runs any command without `--config` or `--path` flags
- **THEN** the system loads `tsconfig.json` from the current working directory

#### Scenario: Load project from explicit path
- **WHEN** the user provides `--path /some/dir`
- **THEN** the system loads `tsconfig.json` from `/some/dir`

#### Scenario: Load project from explicit config
- **WHEN** the user provides `--config /some/dir/tsconfig.custom.json`
- **THEN** the system loads that specific tsconfig file

#### Scenario: No tsconfig found
- **WHEN** no `tsconfig.json` exists at the resolved location
- **THEN** the system exits with an error and a clear message

### Requirement: Support .refactorignore file
The system SHALL support a `.refactorignore` file in the project root that excludes files from refactoring scope using gitignore syntax.

#### Scenario: .refactorignore excludes files
- **WHEN** `.refactorignore` contains `src/**/*.generated.ts`
- **THEN** those files are excluded from search, references, unused detection, and refactoring operations

#### Scenario: No .refactorignore present
- **WHEN** no `.refactorignore` file exists in the project root
- **THEN** the system uses only tsconfig `include`/`exclude` rules to determine scope

#### Scenario: Default exclusions
- **WHEN** the system loads a project
- **THEN** `node_modules/`, `dist/`, and `build/` are always excluded regardless of `.refactorignore` content

### Requirement: Source file resolution
The system SHALL provide a resolved list of in-scope source files as the intersection of tsconfig includes and `.refactorignore` excludes.

#### Scenario: File in tsconfig but ignored
- **WHEN** a file matches tsconfig `include` but is excluded by `.refactorignore`
- **THEN** the file is not in scope

#### Scenario: File outside tsconfig
- **WHEN** a file is not matched by tsconfig `include`
- **THEN** the file is not in scope regardless of `.refactorignore`
