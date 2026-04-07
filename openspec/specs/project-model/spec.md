## ADDED Requirements

### Requirement: Load TypeScript project via tsconfig.json
The system SHALL load a target TypeScript project by locating and parsing its `tsconfig.json`. It SHALL use ts-morph to create a `Project` instance with full type information. When no `tsconfig.json` exists in the starting directory, the system SHALL walk up the directory tree until one is found or the filesystem root is reached.

#### Scenario: Load project from current directory
- **WHEN** the user runs any command without `--config` or `--path` flags
- **THEN** the system loads `tsconfig.json` from the current working directory

#### Scenario: Load project from explicit path
- **WHEN** the user provides `--path /some/dir`
- **THEN** the system loads `tsconfig.json` from `/some/dir`

#### Scenario: Load project from explicit config
- **WHEN** the user provides `--config /some/dir/tsconfig.custom.json`
- **THEN** the system loads that specific tsconfig file

#### Scenario: Walk up directory tree
- **WHEN** no `tsconfig.json` exists in the starting directory (cwd or `--path`)
- **AND** no `--config` flag is provided
- **THEN** the system SHALL check each parent directory in ascending order until a `tsconfig.json` is found

#### Scenario: No tsconfig found after walking up
- **WHEN** no `tsconfig.json` exists in the starting directory or any ancestor up to the filesystem root
- **THEN** the system exits with an error and a clear message

#### Scenario: Nearest ancestor wins
- **WHEN** multiple ancestor directories contain `tsconfig.json`
- **THEN** the system uses the nearest (lowest) ancestor's `tsconfig.json`

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
