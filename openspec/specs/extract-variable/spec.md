## Purpose

Specifies fixture coverage and implementation requirements for the Extract Variable refactoring. The current implementation uses text-matching to find the target expression and scopes replacements to the containing block.

## Requirements

### Requirement: Must-Have Edge Case Fixtures

The implementation SHALL be verified against the following must-have fixtures:

#### Scenario: repeated-expression
- **GIVEN** the same expression appears multiple times in the containing scope
- **WHEN** extract-variable is applied
- **THEN** all occurrences of the expression in scope are replaced with the new variable, and a single `const` declaration is inserted before the first occurrence

#### Scenario: function-call-expression
- **GIVEN** the target is a function call expression
- **WHEN** extract-variable is applied
- **THEN** the call expression is extracted into a `const` variable and all occurrences are replaced

#### Scenario: nested-scope
- **GIVEN** the target expression exists only inside an inner scope (e.g., an IIFE or arrow function)
- **WHEN** extract-variable is applied
- **THEN** the variable is declared inside that inner scope, not at the outer function level

#### Scenario: string-literal
- **GIVEN** the target is a repeated string literal (magic string)
- **WHEN** extract-variable is applied
- **THEN** all occurrences of the literal in scope are replaced with the new variable

#### Scenario: object-literal
- **GIVEN** the target is an object literal expression
- **WHEN** extract-variable is applied
- **THEN** the object literal is extracted into a `const` variable and all occurrences are replaced

### Requirement: Should-Have Edge Case Fixtures

The implementation SHOULD be verified against the following fixtures:

#### Scenario: conditional-expression
- **GIVEN** the target is a ternary expression
- **WHEN** extract-variable is applied
- **THEN** the ternary is extracted into a `const` variable

#### Scenario: template-literal
- **GIVEN** the target is a template literal expression
- **WHEN** extract-variable is applied
- **THEN** the template literal is extracted into a `const` variable

### Requirement: Nice-to-Have Edge Case Fixtures

The implementation MAY be verified against the following fixture:

#### Scenario: partial-match-disambiguation
- **GIVEN** the target expression `a + b` appears both as a standalone expression and as a sub-expression of a larger expression `a + b + c`
- **WHEN** extract-variable is applied
- **THEN** the behavior is documented: whether the sub-expression within the larger expression is also replaced is a defined and tested outcome

### Requirement: Known Concerns — Text-Matching Ambiguity

The implementation SHALL document behavior when multiple nodes match the target text (e.g., `(a + b)` vs `a + b`). Matching must be deterministic and predictable.

### Requirement: Known Concerns — Operator Precedence

The implementation SHALL NOT introduce operator precedence bugs. When the extracted variable replaces a sub-expression, the resulting code must be semantically equivalent (wrapping in parentheses if required).
