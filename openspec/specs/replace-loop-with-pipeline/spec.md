## Purpose

Specifies fixture coverage and implementation requirements for the Replace Loop With Pipeline refactoring. The current implementation handles `for-of` loops only: a single `push` becomes `.map()` or spread, and multiple/other statements become `.forEach()`. It does not detect filter patterns, break/continue, or async for-of.

## Requirements

### Requirement: Must-Have Edge Case Fixtures

The implementation SHALL be verified against the following must-have fixtures:

#### Scenario: map-with-expression
- **GIVEN** a `for-of` loop pushes a non-trivially-transformed value (`push(price * 1.1)`)
- **WHEN** replace-loop-with-pipeline is applied
- **THEN** the loop is replaced with `.map((price) => price * 1.1)`

#### Scenario: foreach-multiple-statements
- **GIVEN** the loop body has multiple statements
- **WHEN** replace-loop-with-pipeline is applied
- **THEN** the loop is replaced with `.forEach((item) => { ... })` containing all statements

#### Scenario: destructuring-loop-var
- **GIVEN** the loop variable is destructured (`for (const { a, b } of pairs)`)
- **WHEN** replace-loop-with-pipeline is applied
- **THEN** the destructuring pattern is used as the arrow function parameter (e.g., `.map(({ a, b }) => a + b)`)

#### Scenario: loop-with-if-filter
- **GIVEN** the loop body is `if (pred) { arr.push(x) }` — a filter-then-collect pattern
- **WHEN** replace-loop-with-pipeline is applied
- **THEN** the loop is replaced with `.filter((n) => pred)` (optionally chained with `.map()` if a transformation is applied)

#### Scenario: identity-copy
- **GIVEN** the loop body is `copy.push(item)` with no transformation
- **WHEN** replace-loop-with-pipeline is applied
- **THEN** the loop is replaced with `const copy = [...src]` (spread copy)

#### Scenario: for-in-rejection
- **GIVEN** the loop is a `for-in` loop
- **WHEN** replace-loop-with-pipeline is applied
- **THEN** the refactoring is rejected with a clear precondition error (no for-of at that line)

#### Scenario: indexed-for-rejection
- **GIVEN** the loop is a traditional `for (let i = 0; i < n; i++)` loop
- **WHEN** replace-loop-with-pipeline is applied
- **THEN** the refactoring is rejected with a clear precondition error

### Requirement: Should-Have Edge Case Fixtures

The implementation SHOULD be verified against the following fixtures:

#### Scenario: nested-loop
- **GIVEN** there are nested `for-of` loops and the target line refers to the inner loop
- **WHEN** replace-loop-with-pipeline is applied
- **THEN** only the inner loop is converted; the outer loop is unchanged

#### Scenario: loop-with-break
- **GIVEN** the loop body contains a `break` statement
- **WHEN** replace-loop-with-pipeline is applied
- **THEN** the refactoring is rejected with a clear precondition error (pipeline cannot replicate break semantics)

### Requirement: Implementation — Filter Pattern Detection

The implementation SHALL detect the pattern `if (pred) arr.push(x)` and generate `.filter((item) => pred)` instead of `.forEach()`. If a transformation is also applied (`if (pred) arr.push(transform(x))`), a `.filter().map()` chain SHALL be generated.

### Requirement: Implementation — Break and Continue Detection

The implementation SHALL refuse to convert any loop whose body contains `break` or `continue` statements, since these cannot be replicated with standard array pipeline methods without changing semantics.

### Requirement: Implementation — Async For-Of

The implementation SHALL detect `for await (const x of asyncIter)` and refuse (async iteration semantics are different from synchronous pipeline methods).
