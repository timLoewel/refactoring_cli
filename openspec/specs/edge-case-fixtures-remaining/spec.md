## ADDED Requirements

### Requirement: Fixture coverage for all remaining refactorings
Each of the 53 refactorings listed in tasks.md section 13 SHALL have 3-5 `.fixture.ts` files added to its `fixtures/` directory, covering the most important edge cases documented in the corresponding spec under `openspec/specs/`.

#### Scenario: Fixtures are auto-discovered
- **WHEN** the fixture runner scans `src/refactorings/`
- **THEN** all new fixtures are discovered and executed without manual test registration

#### Scenario: Each fixture exports params
- **WHEN** a fixture file is loaded
- **THEN** it exports a `params` object with `file` and `target` keys matching the refactoring's parameter schema

### Requirement: Precondition rejection fixtures
For refactorings with known rejection cases (e.g., dependent loops for split-loop, recursive for inline-function), at least one fixture per refactoring SHALL test the precondition error path. These fixtures are named with a `-reject` suffix.

#### Scenario: Rejection fixture triggers precondition error
- **WHEN** a `*-reject.fixture.ts` is applied
- **THEN** the refactoring raises a precondition error rather than producing invalid output

### Requirement: Class-hierarchy refactoring fixtures
Refactorings operating on class hierarchies (pull-up-field, push-down-field, pull-up-method, push-down-method, pull-up-constructor-body, extract-superclass, collapse-hierarchy, remove-subclass, replace-type-code-with-subclasses, replace-subclass-with-delegate, replace-superclass-with-delegate) SHALL each have fixtures covering typed members, access modifiers, and multi-subclass scenarios.

#### Scenario: Typed member preservation
- **WHEN** a pull-up or push-down fixture operates on a typed field or method
- **THEN** the type annotation is preserved in the destination class

#### Scenario: Multiple subclasses
- **WHEN** a hierarchy refactoring fixture has multiple subclasses
- **THEN** all relevant subclasses are updated correctly

### Requirement: Encapsulation refactoring fixtures
Refactorings in the encapsulation group (encapsulate-record, encapsulate-collection, encapsulate-variable, hide-delegate, remove-middle-man, remove-setting-method) SHALL each have fixtures covering typed fields, caller updates, and access patterns.

#### Scenario: Caller sites are updated
- **WHEN** an encapsulation refactoring adds getter/setter methods
- **THEN** all direct field accesses at call sites are rewritten to use the new accessors

### Requirement: Conditional refactoring fixtures
Refactorings in the conditional group (consolidate-conditional-expression, decompose-conditional, replace-nested-conditional-with-guard-clauses, replace-control-flag-with-break, introduce-assertion, introduce-special-case, replace-conditional-with-polymorphism) SHALL each have fixtures covering complex conditions, multiple branches, and early-return patterns.

#### Scenario: Multiple guard clauses
- **WHEN** `replace-nested-conditional-with-guard-clauses` processes a function with multiple nested conditions
- **THEN** each condition is extracted as a separate guard clause with early return

### Requirement: Function-composition refactoring fixtures
Refactorings that restructure function boundaries (parameterize-function, remove-flag-argument, replace-parameter-with-query, replace-query-with-parameter, return-modified-value, separate-query-from-modifier, substitute-algorithm, replace-function-with-command, replace-command-with-function) SHALL each have fixtures covering multiple callers, parameter mappings, and return value handling.

#### Scenario: Multiple callers are updated
- **WHEN** a function-composition refactoring modifies a function signature
- **THEN** all call sites are updated to match the new signature

### Requirement: Data-organization refactoring fixtures
Refactorings that restructure data (replace-primitive-with-object, change-reference-to-value, change-value-to-reference, replace-magic-literal, replace-derived-variable-with-query, introduce-parameter-object, preserve-whole-object) SHALL each have fixtures covering typed fields, multiple references, and computed values.

#### Scenario: Magic literal replacement in templates
- **WHEN** `replace-magic-literal` targets a literal used inside a template literal
- **THEN** the template expression correctly references the named constant

### Requirement: Statement-movement refactoring fixtures
Refactorings that move statements across boundaries (move-statements-into-function, move-statements-to-callers, split-loop, split-phase, combine-functions-into-class, combine-functions-into-transform) SHALL each have fixtures covering multiple callers, shared data, and variable leakage.

#### Scenario: Split-loop with dependent accumulations is rejected
- **WHEN** `split-loop` encounters two accumulations where one depends on the other
- **THEN** the refactoring SHALL refuse with a precondition error

### Requirement: Error-handling refactoring fixtures
Refactorings that restructure error handling (replace-error-code-with-exception, replace-exception-with-precheck) SHALL each have fixtures covering null returns, negative returns, try-catch guards, and multiple clauses.

#### Scenario: Null return replaced with exception
- **WHEN** `replace-error-code-with-exception` targets a function returning null on error
- **THEN** the null return is replaced with a thrown exception and callers are updated

### Requirement: Bug fixes from fixture failures
When a fixture exposes a bug in a refactoring's transformation logic, the bug SHALL be fixed in the same task section as the fixture. Fixes MUST NOT break existing passing fixtures.

#### Scenario: Existing fixtures still pass after fix
- **WHEN** a bug fix is applied to a refactoring
- **THEN** all previously passing fixtures for that refactoring continue to pass
