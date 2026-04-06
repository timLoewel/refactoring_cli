## ADDED Requirements

### Requirement: Python parser singleton lifecycle
The tree-sitter Python parser SHALL be managed as a lazy singleton with proper cleanup. Concurrent test suites MUST NOT interfere with each other's parser state.

#### Scenario: Parser survives full suite run
- **WHEN** the full test suite runs (all-fixtures + all-python-fixtures + unit tests)
- **THEN** tree-sitter parser tests pass without "Cannot read properties of undefined" errors

#### Scenario: Parser cleaned up after test suite
- **WHEN** a test suite using tree-sitter finishes
- **THEN** the parser resources are released via `afterAll` hook

### Requirement: Extract-function enumerate provides line ranges
The extract-function `enumerate` function SHALL return candidates with valid `startLine` and `endLine` parameters (function body ranges), not defaulting to 0.

#### Scenario: Enumerate returns function body ranges
- **WHEN** extract-function enumerate scans a source file
- **THEN** each candidate includes the start and end line of a function body suitable for extraction

### Requirement: Enumerate pre-filters invalid candidates
Refactoring `enumerate` functions SHALL pre-filter candidates to exclude those that would fail preconditions, reducing the false-start rate in real-codebase testing.

#### Scenario: Consolidate-conditional filters non-consecutive ifs
- **WHEN** consolidate-conditional-expression enumerate scans a source file
- **THEN** only if-statements that have at least one consecutive sibling if-statement are returned as candidates

#### Scenario: Separate-query-from-modifier filters void functions
- **WHEN** separate-query-from-modifier enumerate scans a source file
- **THEN** functions that have no return statement or return void are excluded from candidates
