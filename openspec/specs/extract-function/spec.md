## Purpose

Specifies fixture coverage and implementation requirements for the Extract Function refactoring. The current implementation is minimal — it lacks scope analysis, parameter inference, return value handling, and support for extracting from within function bodies.

## Requirements

### Requirement: Must-Have Edge Case Fixtures

The implementation SHALL be verified against the following must-have fixtures:

#### Scenario: reads-outer-variable
- **GIVEN** extracted code references a variable declared above the extraction range
- **WHEN** extract-function is applied
- **THEN** that variable becomes a parameter of the extracted function, and the call site passes it as an argument

#### Scenario: produces-return-value
- **GIVEN** extracted code declares a variable that is used after the extraction range
- **WHEN** extract-function is applied
- **THEN** the extracted function returns that variable, and the call site captures the return value

#### Scenario: inside-function-body
- **GIVEN** the target statements are inside a function body (not top-level file statements)
- **WHEN** extract-function is applied
- **THEN** extraction succeeds, respecting the enclosing function's scope for parameter and return-value inference

#### Scenario: void-side-effects
- **GIVEN** extracted code has only side effects and no value is used after the range
- **WHEN** extract-function is applied
- **THEN** the extracted function has a void return type, and outer-scope references become parameters

#### Scenario: async-context
- **GIVEN** extracted code contains `await` expressions
- **WHEN** extract-function is applied
- **THEN** the extracted function is marked `async`, and the call site uses `await`

#### Scenario: multiple-variables-escape
- **GIVEN** multiple variables declared in the extraction range are used after it
- **WHEN** extract-function is applied
- **THEN** the extracted function returns all escaping variables as a destructured object, and the call site destructures the result

### Requirement: Should-Have Edge Case Fixtures

The implementation SHOULD be verified against the following fixtures:

#### Scenario: loop-break-reject
- **GIVEN** extracted code contains `break` or `continue` referring to an enclosing loop outside the extraction range
- **WHEN** extract-function is applied
- **THEN** the refactoring is rejected with a clear precondition error

#### Scenario: this-context
- **GIVEN** extracted code references `this`
- **WHEN** extract-function is applied
- **THEN** the refactoring either extracts as a class method or explicitly handles `this` binding; it does not silently produce invalid code

#### Scenario: single-expression
- **GIVEN** the extraction range covers a single statement with a complex expression as its initializer
- **WHEN** extract-function is applied
- **THEN** the complex expression is extracted into a function, with outer-scope variables as parameters and the result as the return value

#### Scenario: mutation-of-outer-variable
- **GIVEN** extracted code mutates a `let` variable from outer scope that is used after the range
- **WHEN** extract-function is applied
- **THEN** the refactoring either returns the mutated value from the extracted function or is rejected with a clear error

### Requirement: Nice-to-Have Edge Case Fixtures

The implementation MAY be verified against the following fixtures:

#### Scenario: partial-expression-reject
- **GIVEN** the startLine/endLine range splits a multi-line expression
- **WHEN** extract-function is applied
- **THEN** the refactoring is rejected with a clear precondition error

#### Scenario: generator-yield-reject
- **GIVEN** extracted code contains `yield` without an enclosing generator function within the range
- **WHEN** extract-function is applied
- **THEN** the refactoring is rejected with a clear precondition error

### Requirement: Implementation — Nested Statement Extraction

The implementation SHALL walk all descendant nodes (not just `sf.getStatements()`) to find statements at the given line range and determine the enclosing function or block scope.

### Requirement: Implementation — Scope Analysis

The implementation SHALL perform scope analysis:
- Variables READ in the extraction range that are DECLARED outside it become parameters
- Variables DECLARED in the extraction range that are READ after it become return values
- Variables DECLARED in the extraction range that are WRITTEN after it trigger a mutation warning or refusal

### Requirement: Implementation — Return Value Inference

The implementation SHALL infer return shape:
- 0 escaping variables → `void` return
- 1 escaping variable → `return <var>`
- N escaping variables → `return { var1, var2, ... }` with destructuring at call site

### Requirement: Implementation — Async Detection

The implementation SHALL detect `await` in extracted statements and mark the extracted function as `async`, making the call site use `await`.

### Requirement: Implementation — Precondition Checks

The implementation SHALL reject extraction when:
- `break` or `continue` refers to a loop outside the extraction range
- `yield` appears without an enclosing generator within the range
- `this` is referenced (unless extracting as a method)
