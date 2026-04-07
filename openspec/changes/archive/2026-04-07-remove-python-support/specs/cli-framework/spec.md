## MODIFIED Requirements

### Requirement: Global options
The system SHALL accept global options: `--path <dir>`, `--config <tsconfig-path>`, `--json`, `--version`, `--help`. The `--lang` option SHALL NOT exist.

#### Scenario: --version
- **WHEN** user runs `refactor --version`
- **THEN** the system prints the version derived from package.json at build time and exits

#### Scenario: --help
- **WHEN** user runs `refactor --help`
- **THEN** the system prints usage for all commands without referencing language selection

## REMOVED Requirements

### Requirement: Language detection and selection
**Reason**: Python support removed. All refactorings are TypeScript. Language detection (`detectLanguage`) and the `--lang` CLI option are no longer needed.
**Migration**: Remove `--lang` option from program.ts, remove `lang` from `GlobalOptions`, remove `detectLanguage` function from apply.ts, remove language-match check in `inProcessApply`.
