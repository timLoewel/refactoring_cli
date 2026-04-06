## Purpose

Specifies fixture coverage and implementation requirements for the Move Function refactoring. The current implementation copies function text to the destination and removes it from the source, but performs no import handling, consumer import rewriting, or local dependency resolution.

## Requirements

### Requirement: Must-Have Edge Case Fixtures — All Multi-File

All move-function fixtures SHALL use the multi-file format (directory with `entry.ts` + supporting files).

#### Scenario: carries-imports
- **GIVEN** the function body uses a symbol that is imported at the top of the source file
- **WHEN** move-function is applied
- **THEN** the required import is added to the destination file, and the source file's import is removed if no other symbols in the source file use it

#### Scenario: consumer-updates
- **GIVEN** other files import the function being moved
- **WHEN** move-function is applied
- **THEN** all consumer files have their import paths updated from the source file to the destination file

#### Scenario: preserves-export
- **GIVEN** the function being moved is exported
- **WHEN** move-function is applied
- **THEN** the function retains its `export` modifier in the destination file

#### Scenario: with-type-imports
- **GIVEN** the function signature uses a type that is imported via `import type` in the source file
- **WHEN** move-function is applied
- **THEN** the `import type` declaration is added to the destination file and removed from the source if no longer needed

#### Scenario: references-local-constant
- **GIVEN** the function references a module-level constant in the source file that is also used by other functions remaining in the source
- **WHEN** move-function is applied
- **THEN** the constant is exported from the source file and imported in the destination file (or the constant is moved and re-exported)

#### Scenario: no-dependencies
- **GIVEN** the function has zero external references or imports
- **WHEN** move-function is applied
- **THEN** the function moves cleanly and the calling file's import path is updated

### Requirement: Should-Have Edge Case Fixtures

The implementation SHOULD be verified against the following fixtures:

#### Scenario: with-jsdoc
- **GIVEN** the function has a JSDoc comment
- **WHEN** move-function is applied
- **THEN** the JSDoc comment is preserved in the destination (using `getFullText()` to capture leading trivia)

#### Scenario: namespace-import
- **GIVEN** the function uses a namespace import (`import * as utils from ...`)
- **WHEN** move-function is applied
- **THEN** the namespace import is added to the destination file

#### Scenario: overloaded-function
- **GIVEN** the function has TypeScript overload signatures
- **WHEN** move-function is applied
- **THEN** all overload signatures and the implementation declaration move together

#### Scenario: arrow-function-in-const
- **GIVEN** the function is defined as an arrow function stored in a `const`
- **WHEN** move-function is applied
- **THEN** the refactoring either supports moving const arrow functions or rejects with a clear precondition error

### Requirement: Nice-to-Have Edge Case Fixtures

The implementation MAY be verified against the following fixtures:

#### Scenario: re-export-barrel
- **GIVEN** the function is re-exported through a barrel/index file
- **WHEN** move-function is applied
- **THEN** the barrel file's re-export path is updated

#### Scenario: generic-function
- **GIVEN** the function has type parameters (generics)
- **WHEN** move-function is applied
- **THEN** the type parameters are preserved in the destination

### Requirement: Implementation — Import Analysis

The implementation SHALL walk the function body AST to collect all referenced identifiers, cross-reference them with the source file's imports, and copy the required imports to the destination (avoiding duplicates with existing imports).

### Requirement: Implementation — Consumer Import Rewriting

The implementation SHALL scan all project source files for imports from the source file that reference the moved function name, and rewrite those import specifiers to point to the destination file. When an import statement has multiple specifiers, only the specifier for the moved function shall be changed.

### Requirement: Implementation — Export Preservation

The implementation SHALL preserve the `export` modifier when moving an exported function to the destination. Default exports SHALL be handled explicitly (the semantics change when a named export becomes a new file's default).

### Requirement: Implementation — Local Reference Handling

When the moved function references a module-level symbol that remains in the source file:
- If the symbol is used only by the moved function → move the symbol to the destination
- If the symbol is shared → export it from the source and import it in the destination

### Requirement: Implementation — Overload Support

The implementation SHALL detect and move all overload signatures (same name) together with the implementation declaration.

### Requirement: Implementation — JSDoc Preservation

The implementation SHALL use `getFullText()` or equivalent to capture leading comment ranges so that JSDoc blocks move with the function.
