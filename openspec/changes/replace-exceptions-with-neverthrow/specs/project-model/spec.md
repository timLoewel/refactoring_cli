## MODIFIED Requirements

### Requirement: Load TypeScript project via tsconfig.json
The system SHALL load a target TypeScript project by locating and parsing its `tsconfig.json`. It SHALL use ts-morph to create a `Project` instance with full type information. When no `tsconfig.json` exists in the starting directory, the system SHALL walk up the directory tree until one is found or the filesystem root is reached. The `loadProject` function SHALL return a `ProjectResult<ProjectModel>` instead of throwing on failure.

#### Scenario: Load project from current directory
- **WHEN** the user runs any command without `--config` or `--path` flags
- **THEN** the system returns `ok({ project, projectRoot, sourceFiles })` loaded from the current working directory

#### Scenario: Load project from explicit path
- **WHEN** the user provides `--path /some/dir`
- **THEN** the system returns `ok({ project, projectRoot, sourceFiles })` loaded from `/some/dir`

#### Scenario: Load project from explicit config
- **WHEN** the user provides `--config /some/dir/tsconfig.custom.json`
- **THEN** the system returns `ok({ project, projectRoot, sourceFiles })` using that specific tsconfig file

#### Scenario: Walk up directory tree
- **WHEN** no `tsconfig.json` exists in the starting directory (cwd or `--path`)
- **AND** no `--config` flag is provided
- **THEN** the system SHALL check each parent directory in ascending order until a `tsconfig.json` is found

#### Scenario: No tsconfig found after walking up
- **WHEN** no `tsconfig.json` exists in the starting directory or any ancestor up to the filesystem root
- **THEN** the system returns `err({ kind: "project", message })` with a clear message

#### Scenario: Explicit config not found
- **WHEN** the user provides `--config /nonexistent/tsconfig.json` and the file does not exist
- **THEN** the system returns `err({ kind: "project", message })` indicating the config was not found

#### Scenario: Nearest ancestor wins
- **WHEN** multiple ancestor directories contain `tsconfig.json`
- **THEN** the system uses the nearest (lowest) ancestor's `tsconfig.json`
