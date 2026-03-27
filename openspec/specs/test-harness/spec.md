## ADDED Requirements

### Requirement: Two fixture shapes — single-file and multi-file
Each test fixture SHALL be either a single `.fixture.ts` file OR a directory containing multiple `.ts` files. Both shapes MUST export a `main()` function returning a deterministic string.

#### Scenario: Single-file fixture
- **WHEN** a refactoring operates within one file
- **THEN** the fixture is a `.fixture.ts` file that exports `function main(): string` with no side effects

#### Scenario: Multi-file fixture
- **WHEN** a refactoring operates across multiple files (e.g. Move Function, Rename across codebase, fix-imports)
- **THEN** the fixture is a directory containing multiple `.ts` files, a `tsconfig.json`, and an `entry.ts` that exports `main(): string`. The entry file imports from the other files to exercise cross-file behavior.

#### Scenario: Multi-file refactoring changes are verified across all files
- **WHEN** a multi-file fixture is refactored
- **THEN** the harness verifies that all changed files compile, not just the entry file

#### Scenario: Cross-file imports remain valid after refactoring
- **WHEN** a refactoring moves or renames a symbol used across files
- **THEN** all import statements are updated and the full project compiles and runs with identical output

### Requirement: Compile-and-run comparison
The test harness SHALL verify semantic preservation by compiling and running code before and after refactoring, then comparing outputs.

#### Scenario: Semantic preservation verified
- **WHEN** a refactoring test runs
- **THEN** the harness: (1) compiles original fixture, (2) runs it and captures stdout, (3) applies refactoring to a copy, (4) compiles refactored code, (5) runs it and captures stdout, (6) asserts outputs are identical

#### Scenario: Refactored code fails to compile
- **WHEN** a refactoring produces code that doesn't compile
- **THEN** the test fails with compilation errors

#### Scenario: Output differs after refactoring
- **WHEN** the refactored code produces different output
- **THEN** the test fails showing both outputs

### Requirement: Structural change verification
The test harness SHALL verify that the refactoring actually changed the code structure (not a no-op).

#### Scenario: No-op detection
- **WHEN** a refactoring is applied but produces identical AST
- **THEN** the test fails indicating the refactoring had no effect

### Requirement: Multiple fixtures per refactoring
Each refactoring SHALL have multiple fixture files testing different scenarios (basic case, edge cases, complex cases).

#### Scenario: Fixture discovery
- **WHEN** tests run for a refactoring
- **THEN** all `.fixture.ts` files (or fixture directories) in the refactoring's `fixtures/` directory are discovered and tested
