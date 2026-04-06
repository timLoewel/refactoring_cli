## Purpose

Specifies fixture coverage and implementation requirements for the Replace Temp With Query refactoring. The current implementation has a critical bug: it hardcodes `function name(): number` as the return type regardless of the actual variable type, causing compilation errors for non-numeric variables.

## Requirements

### Requirement: Critical Bug — Hardcoded Return Type

The implementation SHALL NOT hardcode the return type of the extracted query function. The return type MUST be inferred from the variable's type annotation or from the initializer expression type via the TypeScript type checker.

### Requirement: Must-Have Edge Case Fixtures

The implementation SHALL be verified against the following must-have fixtures:

#### Scenario: string-type
- **GIVEN** the target variable holds a string value
- **WHEN** replace-temp-with-query is applied
- **THEN** the generated function has return type `string`, not `number`

#### Scenario: boolean-type
- **GIVEN** the target variable holds a boolean value (e.g., `const isValid = score >= 60`)
- **WHEN** replace-temp-with-query is applied
- **THEN** the generated function has return type `boolean`, not `number`

#### Scenario: numeric-type
- **GIVEN** the target variable holds a numeric value
- **WHEN** replace-temp-with-query is applied
- **THEN** the generated function has return type `number` (this case works in the current implementation)

#### Scenario: array-type
- **GIVEN** the target variable holds an array (e.g., `const doubled = nums.map(n => n * 2)`)
- **WHEN** replace-temp-with-query is applied
- **THEN** the generated function has an array return type (e.g., `number[]`), not `number`

#### Scenario: multiple-references
- **GIVEN** the target variable is referenced more than once
- **WHEN** replace-temp-with-query is applied
- **THEN** all references are replaced with calls to the extracted query function

### Requirement: Should-Have Edge Case Fixtures

The implementation SHOULD be verified against the following fixtures:

#### Scenario: in-class-method
- **GIVEN** the target variable is inside a class method and its initializer references `this`
- **WHEN** replace-temp-with-query is applied
- **THEN** the extracted function is added as a method on the class (not inserted at file top level where `this` would be invalid)

#### Scenario: with-outer-scope-reference
- **GIVEN** the initializer references variables from an enclosing function scope (not file scope)
- **WHEN** replace-temp-with-query is applied
- **THEN** those variables become parameters of the extracted query function, and all call sites pass them as arguments

### Requirement: Implementation — Return Type Inference

The implementation SHALL infer the return type of the extracted function from the variable's existing type annotation if present, or from the TypeScript type checker applied to the initializer expression. The hardcoded `number` return type SHALL be removed.

### Requirement: Implementation — Outer Scope Variables as Parameters

The implementation SHALL perform scope analysis on the initializer expression: variables read in the initializer that are declared in an enclosing function scope (not file/module scope) SHALL become parameters of the extracted query function. All call sites for the extracted function SHALL pass those variables as arguments.

### Requirement: Implementation — Insertion Location

When the target variable is inside a class method, the extracted function SHALL be inserted as a method on the class, not at the top of the file. When the target variable is inside a standalone function, the extracted function SHALL be inserted at an appropriate scope level where the outer-scope variables it references are accessible.
