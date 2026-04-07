## Purpose

Provides a shared utility for removing unused imports and variable declarations after refactoring transformations, preventing compiler warnings from orphaned symbols.

## Requirements

### Requirement: Post-transformation unused declaration cleanup
The system SHALL provide a `cleanupUnused(sourceFile)` utility that removes imports and variable declarations flagged as unused by the TypeScript compiler after a refactoring transformation.

#### Scenario: Unused import removed
- **WHEN** a refactoring removes code that was the sole consumer of an import
- **THEN** `cleanupUnused` removes the now-unused import declaration

#### Scenario: Unused variable removed
- **WHEN** a refactoring restructures code leaving a variable declaration with no references
- **THEN** `cleanupUnused` removes the unused variable declaration

#### Scenario: Used symbols preserved
- **WHEN** `cleanupUnused` runs on a source file
- **THEN** imports and variables that are still referenced remain untouched

#### Scenario: Multi-specifier import partially cleaned
- **WHEN** an import like `import { A, B } from "./mod"` has only `A` unused
- **THEN** `cleanupUnused` removes only `A`, keeping `import { B } from "./mod"`

### Requirement: Cleanup integrated into refactorings that orphan declarations
Refactorings that commonly leave unused declarations SHALL call `cleanupUnused` as a final step in their `apply` function. At minimum: replace-nested-conditional-with-guard-clauses, replace-subclass-with-delegate, split-variable, replace-command-with-function, and split-loop.

#### Scenario: Guard clause extraction cleans up
- **WHEN** replace-nested-conditional-with-guard-clauses adds early returns that bypass subsequent code
- **THEN** any imports/variables used only by the bypassed code are removed

#### Scenario: Split-variable cleans up original declaration
- **WHEN** split-variable renames all references to segment-specific names
- **THEN** the original variable declaration (if now unreferenced) is removed
