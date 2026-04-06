## Purpose

Specifies fixture coverage and implementation requirements for the Rename Variable refactoring. The current implementation uses ts-morph's `nameNode.rename()`, which is scope-aware and handles most cases. These fixtures primarily document and lock in existing behavior, and identify cases where the implementation may need broadening.

## Requirements

### Requirement: Must-Have Edge Case Fixtures

The implementation SHALL be verified against the following must-have fixtures:

#### Scenario: template-literal
- **GIVEN** the target variable is referenced inside template literal interpolations (`${}`)
- **WHEN** rename-variable is applied
- **THEN** all interpolation sites are renamed

#### Scenario: shorthand-property
- **GIVEN** the target variable is used as a shorthand property in an object literal (`{ name }`)
- **WHEN** rename-variable is applied
- **THEN** the shorthand is updated (ts-morph renames the symbol, so `{ name }` becomes `{ label }` — the property key changes because it is the same symbol); the actual behavior SHALL be verified and tested

#### Scenario: arrow-function-variable
- **GIVEN** the target variable holds an arrow function and is called at multiple sites
- **WHEN** rename-variable is applied
- **THEN** the declaration and all call sites are renamed

#### Scenario: shadowing
- **GIVEN** the target variable name exists at both an outer scope and an inner scope (shadowing)
- **WHEN** rename-variable is applied targeting the outer declaration
- **THEN** only the outer declaration and its references are renamed; the inner declaration is untouched

#### Scenario: property-vs-variable
- **GIVEN** the target variable name coincides with an object property name (`obj.name`, `{ name: "Alice" }`)
- **WHEN** rename-variable is applied
- **THEN** only the variable declaration and its identifier references are renamed; object property keys and member access expressions are untouched

#### Scenario: for-of-variable
- **GIVEN** the target variable is a `for-of` loop binding
- **WHEN** rename-variable is applied
- **THEN** the loop binding and all references inside the loop body are renamed

#### Scenario: closure-capture
- **GIVEN** the target variable is captured by a nested arrow function
- **WHEN** rename-variable is applied
- **THEN** the declaration and the reference inside the nested function are both renamed

#### Scenario: typeof-reference
- **GIVEN** the target variable is referenced in a type position via `typeof config`
- **WHEN** rename-variable is applied
- **THEN** both the value-position reference and the `typeof` type-position reference are renamed

### Requirement: Should-Have Edge Case Fixtures

The implementation SHOULD be verified against the following fixtures:

#### Scenario: function-parameter
- **GIVEN** the target is a function parameter (ParameterDeclaration), not a VariableDeclaration
- **WHEN** rename-variable is applied
- **THEN** the parameter name and all its references in the function body are renamed (the implementation may need to search ParameterDeclaration in addition to VariableDeclaration)

#### Scenario: computed-property-key
- **GIVEN** the target variable is used as a computed property key (`[key]`) and in element access (`obj[key]`)
- **WHEN** rename-variable is applied
- **THEN** both uses are renamed

#### Scenario: default-parameter-value
- **GIVEN** the target variable is used as the default value expression for a function parameter
- **WHEN** rename-variable is applied
- **THEN** the default value reference is renamed

#### Scenario: export-declaration
- **GIVEN** the target variable is exported (`export const version = ...`)
- **WHEN** rename-variable is applied
- **THEN** the declaration and all references (including the export) are renamed

### Requirement: Nice-to-Have Edge Case Fixtures

The implementation MAY be verified against the following fixture:

#### Scenario: let-mutation
- **GIVEN** the target variable is declared with `let` and is reassigned multiple times
- **WHEN** rename-variable is applied
- **THEN** the declaration and all assignment targets and reference sites are renamed

### Requirement: Implementation — Declaration Search Scope

The current implementation searches `VariableDeclaration` nodes. To support function parameters, the implementation SHALL also search `ParameterDeclaration` nodes, or use a broader symbol-based lookup that finds the declaration regardless of node kind.

### Requirement: Implementation — Shadowing Robustness

The current implementation uses `.find()` which returns the first match in source order. When multiple declarations share a name at different scopes, the implementation SHALL target the declaration at the specified line or scope, not just the first declaration found in source order.
