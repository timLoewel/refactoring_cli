## MODIFIED Requirements

### Requirement: CLI entry point with subcommands
The system SHALL provide a `refactor` CLI with subcommands: `apply`, `list`, `describe`, `search`, `references`, `unused`, `fix-imports`, `serve`, `help`.

#### Scenario: Run with no arguments
- **WHEN** user runs `refactor` with no arguments
- **THEN** the system prints usage information and exits with code 0

#### Scenario: Unknown command
- **WHEN** user runs `refactor unknown-command`
- **THEN** the system exits with code 1 and a JSON error message

#### Scenario: Serve subcommand
- **WHEN** user runs `refactor serve --path <dir>`
- **THEN** the system starts the daemon server in the foreground for the specified project root
