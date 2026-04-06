## Purpose
Generate and merge Python import statements when refactorings move or extract code that references types from other modules.

## Requirements

### Requirement: Import statement generation for all styles
The system SHALL generate valid Python import statements for all import styles used in the codebase.

#### Scenario: All import styles supported
- **WHEN** a type from another module is referenced in moved/extracted code
- **THEN** the system generates the correct import using whichever style (`import module`, `from module import name`, `from module import name as alias`, `import module as alias`, relative imports, re-exports via `__init__.py`) matches the source

#### Scenario: Builtins are not imported
- **WHEN** referenced types are Python builtins (`str`, `int`, `float`, `bool`, `list`, `dict`, `tuple`, `set`, `bytes`, `None`, `type`)
- **THEN** no import statement is generated for them

### Requirement: Import merging without duplication
The system SHALL merge new imports with existing imports in the target file without creating duplicates.

#### Scenario: Merge into existing from-import
- **WHEN** the target file already has `from X import a` and the refactoring needs `b` from `X`
- **THEN** the result is `from X import a, b`, not a second import line

#### Scenario: No duplicate when already imported
- **WHEN** the required import already exists in the target file
- **THEN** no duplicate import line is added

### Requirement: Type annotation preservation
The system SHALL preserve the annotation syntax used in the source code.

#### Scenario: Annotation syntax unchanged
- **WHEN** code uses `Optional[str]` or `str | None`
- **THEN** the moved/extracted code retains the same annotation syntax

#### Scenario: Typing module variants handled correctly
- **WHEN** annotations use typing module generics (`Optional`, `List`, `Union`, etc.)
- **THEN** the correct `from typing import ...` statement is generated; PEP 585/604 forms (`list[int]`, `str | None`) do not generate typing imports

### Requirement: Import grouping
The system SHALL group inserted imports following PEP 8 convention.

#### Scenario: PEP 8 import order
- **WHEN** new imports are inserted into a file
- **THEN** they are placed in the correct group: stdlib first, then third-party, then local

### Requirement: Testing strategy
The codegen layer SHALL be tested exhaustively via unit tests; individual refactorings verify integration via typed and cross-file fixtures rather than repeating the full matrix.

#### Scenario: Typed fixture per refactoring
- **WHEN** a Python refactoring is tested
- **THEN** at least one fixture verifies annotation preservation after the refactoring

#### Scenario: Cross-file fixture per refactoring
- **WHEN** a Python refactoring moves code between files
- **THEN** at least one fixture verifies that import statements are correctly rewritten
