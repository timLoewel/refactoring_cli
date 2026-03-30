## MODIFIED Requirements

### Requirement: Global options
The system SHALL accept global options: `--path <dir>`, `--config <tsconfig-path>`, `--json`, `--version`, `--help`.

#### Scenario: --version
- **WHEN** user runs `refactor --version`
- **THEN** the system prints the version derived from package.json at build time and exits

#### Scenario: --help
- **WHEN** user runs `refactor --help`
- **THEN** the system prints usage for all commands
