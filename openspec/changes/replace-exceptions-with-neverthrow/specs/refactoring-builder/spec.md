## MODIFIED Requirements

### Requirement: defineRefactoring builder function
The system SHALL provide a `defineRefactoring()` function that accepts a declarative config and returns a registered `RefactoringDefinition`.

#### Scenario: Basic refactoring definition
- **WHEN** a module calls `defineRefactoring({ name, kebabName, tier, description, params, resolve, apply })`
- **THEN** the refactoring is registered in the global registry and the definition is returned

#### Scenario: Param helpers generate ParamSchema
- **WHEN** params are defined using `fileParam()`, `stringParam("target", "desc")`, `identifierParam("name", "desc")`
- **THEN** a `ParamSchema` is generated with correct definitions and a validate function that checks types and required fields

#### Scenario: Validate rejects invalid params
- **WHEN** `validate()` is called with missing or wrong-typed params
- **THEN** it returns `err(ParamError)` with a clear message naming the invalid param

### Requirement: Shared target resolvers
The system SHALL provide reusable resolver functions that handle file lookup and return typed contexts using `Result` types.

#### Scenario: resolveSourceFile
- **WHEN** `resolveSourceFile(project, params)` is called with a valid file param
- **THEN** it returns `ok({ sourceFile })` with the ts-morph SourceFile

#### Scenario: resolveSourceFile with missing file
- **WHEN** the file does not exist in the project
- **THEN** it returns `err()` with a failure description

#### Scenario: resolveFunction
- **WHEN** `resolveFunction(project, params)` is called with file and target params
- **THEN** it returns `ok({ sourceFile, fn, body })` with the function and its block body

#### Scenario: resolveClass
- **WHEN** `resolveClass(project, params)` is called with file and target params
- **THEN** it returns `ok({ sourceFile, cls })` with the class declaration
