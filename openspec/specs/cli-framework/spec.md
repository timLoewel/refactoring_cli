## ADDED Requirements

### Requirement: CLI entry point with subcommands
The system SHALL provide a `refactor` CLI with subcommands: `apply`, `list`, `describe`, `search`, `references`, `unused`, `fix-imports`, `help`.

#### Scenario: Run with no arguments
- **WHEN** user runs `refactor` with no arguments
- **THEN** the system prints usage information and exits with code 0

#### Scenario: Unknown command
- **WHEN** user runs `refactor unknown-command`
- **THEN** the system exits with code 1 and a JSON error message

### Requirement: JSON output on all commands
Every command SHALL support a `--json` flag that outputs a consistent JSON envelope.

#### Scenario: JSON envelope structure
- **WHEN** any command is run with `--json`
- **THEN** output is `{ "success": boolean, "command": string, "data": <command-specific>, "errors"?: string[], "warnings"?: string[] }`

#### Scenario: Default output without --json
- **WHEN** a command is run without `--json`
- **THEN** output is human-readable text (but JSON is the primary interface)

### Requirement: Global options
The system SHALL accept global options: `--path <dir>`, `--config <tsconfig-path>`, `--json`, `--version`, `--help`.

#### Scenario: --version
- **WHEN** user runs `refactor --version`
- **THEN** the system prints the version derived from package.json at build time and exits

#### Scenario: --help
- **WHEN** user runs `refactor --help`
- **THEN** the system prints usage for all commands
