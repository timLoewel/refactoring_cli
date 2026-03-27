## ADDED Requirements

### Requirement: List all refactorings
`refactor list` SHALL output all 66 supported refactorings with name, kebab-name, description, and tier.

#### Scenario: List all
- **WHEN** user runs `refactor list --json`
- **THEN** output contains an array of all 66 refactorings with `{ name, kebabName, description, tier }`

#### Scenario: Filter by tier
- **WHEN** user runs `refactor list --tier 1 --json`
- **THEN** output contains only tier 1 refactorings

### Requirement: Describe a refactoring
`refactor describe <name>` SHALL output detailed information about a specific refactoring including its parameter schema, preconditions, and a usage example.

#### Scenario: Describe with valid name
- **WHEN** user runs `refactor describe extract-function --json`
- **THEN** output contains `{ name, kebabName, description, tier, params: ParamDefinition[], preconditions: string[], example: { command: string, before: string, after: string } }`

#### Scenario: Describe with unknown name
- **WHEN** user runs `refactor describe nonexistent --json`
- **THEN** output is `{ success: false, errors: ["Unknown refactoring: nonexistent"] }`

### Requirement: Help command
`refactor help` SHALL generate a usage guide listing all commands with short examples, suitable for an LLM to understand the tool's capabilities.

#### Scenario: Help output
- **WHEN** user runs `refactor help --json`
- **THEN** output contains a structured guide with all commands, their parameters, and example invocations
