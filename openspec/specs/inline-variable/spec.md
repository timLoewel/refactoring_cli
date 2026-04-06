## Purpose

Specifies fixture coverage and implementation requirements for the Inline Variable refactoring. The current implementation replaces all identifier references with the initializer text but has known gaps around operator precedence and side-effect semantics.

## Requirements

### Requirement: Must-Have Edge Case Fixtures

The implementation SHALL be verified against the following must-have fixtures:

#### Scenario: used-multiple-times
- **GIVEN** the target variable is referenced at multiple sites
- **WHEN** inline-variable is applied
- **THEN** all reference sites are replaced with the initializer expression

#### Scenario: operator-precedence
- **GIVEN** the initializer is a binary expression (e.g., `a + b`) and at least one reference site is inside a higher-precedence context (e.g., `sum * 2`)
- **WHEN** inline-variable is applied
- **THEN** the inlined initializer is wrapped in parentheses to preserve operator precedence (e.g., `(a + b) * 2`)

#### Scenario: side-effect-initializer
- **GIVEN** the initializer is a function call expression and the variable is referenced more than once
- **WHEN** inline-variable is applied
- **THEN** the refactoring either refuses (because inlining would change evaluation semantics) or proceeds with a documented policy; the expected behavior is clearly tested

#### Scenario: used-once
- **GIVEN** the target variable is referenced exactly once
- **WHEN** inline-variable is applied
- **THEN** the single reference is replaced with the initializer expression and the declaration is removed

#### Scenario: used-in-template
- **GIVEN** the target variable is referenced inside a template literal interpolation
- **WHEN** inline-variable is applied
- **THEN** the interpolation site is replaced with the initializer expression

#### Scenario: let-variable
- **GIVEN** the target variable is declared with `let` and is not reassigned between declaration and all its uses
- **WHEN** inline-variable is applied
- **THEN** inlining proceeds the same as for `const`

### Requirement: Should-Have Edge Case Fixtures

The implementation SHOULD be verified against the following fixtures:

#### Scenario: computed-initializer
- **GIVEN** the initializer is a division expression (e.g., `part / total`) and the reference is used as a method call receiver (e.g., `ratio.toFixed(2)`)
- **WHEN** inline-variable is applied
- **THEN** the inlined expression is wrapped in parentheses to prevent the member access from binding to only part of the expression

#### Scenario: in-condition
- **GIVEN** the target variable is used as an `if` condition
- **WHEN** inline-variable is applied
- **THEN** the condition is replaced with the initializer expression

### Requirement: Implementation — Operator Precedence Wrapping

The implementation SHALL wrap the initializer in parentheses when the initializer is a binary or conditional expression and is being inlined into a position where operator precedence would change the evaluation result.

### Requirement: Implementation — Side-Effect Check

The implementation SHALL detect when the initializer contains a call expression and the variable is referenced more than once, and either refuse or warn that inlining will change evaluation semantics (the call will execute N times instead of once).

### Requirement: Implementation — Reassignment Check

The implementation SHALL refuse to inline a `let` variable if it is reassigned at any point between its declaration and any of its uses, since the inlined value would not reflect the reassigned value.
