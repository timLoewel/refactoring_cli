## ADDED Requirements

### Requirement: Context-relative type printing
All refactorings that generate type annotations SHALL use `type.getText(node)` for context-relative type resolution. This produces short import names (e.g., `DataSource`) instead of fully-qualified paths (e.g., `import("/path/to/module").DataSource`).

#### Scenario: Imported type printed as short name
- **WHEN** a refactoring extracts a function whose parameter type is an imported class
- **THEN** the generated type annotation uses the short class name, not the `import()` path

#### Scenario: Truly unresolvable type falls back to unknown
- **WHEN** `getText(node)` returns an empty string or an anonymous type
- **THEN** the refactoring falls back to `unknown` as the type annotation

### Requirement: Generic type parameter propagation
Refactorings that extract functions from generic contexts SHALL carry type parameters to the extracted function when the extracted code references them.

#### Scenario: Extracted function preserves generic
- **WHEN** decompose-conditional extracts a condition from a generic function `foo<T>(x: T)`
- **THEN** the extracted condition function includes the type parameter `<T>`

#### Scenario: Non-generic extraction omits type params
- **WHEN** the extracted code does not reference any type parameters
- **THEN** no type parameters are added to the extracted function
