## Why

Python support was exploratory — after investigating the full scope of Python's syntax variation (type annotations spectrum, class definition styles, scoping subtleties, third-party magic), the maintenance cost outweighs the value. The ~30,000 lines of Python support add complexity to every layer (registry, CLI, test infrastructure, CI) without reaching production readiness. Removing it simplifies the codebase and lets us focus on TypeScript refactoring quality.

## What Changes

- **BREAKING**: Remove all 66 Python refactoring implementations (`src/refactorings/*/python.ts`)
- **BREAKING**: Remove Python core infrastructure (`src/python/` — pyright client, tree-sitter parser, codegen modules)
- **BREAKING**: Remove `--lang python` CLI option; tool becomes TypeScript-only
- Remove all 256 Python fixture files (`.fixture.py` and multi-file Python fixtures)
- Remove Python test infrastructure (`python-fixture-runner.ts`, `all-python-fixtures.test.ts`, `python-rename.test.ts`)
- Remove npm dependencies: `pyright`, `tree-sitter`, `tree-sitter-python`
- Remove `language` field from `RefactoringDefinition` type (or constrain to `"typescript"`)
- Remove 3 Python-specific OpenSpec specs

## Capabilities

### New Capabilities

_None — this is a removal change._

### Modified Capabilities

- `refactoring-engine`: Remove `language: "python"` from `RefactoringDefinition` type, remove `setPythonContext`/`getPythonContext` globals
- `cli-framework`: Remove `--lang` option from CLI, remove Python project initialization path
- `test-harness`: Remove Python fixture runner and Python fixture discovery
- `refactoring-builder`: Remove `definePythonRefactoring` and `pythonParam` exports

## Impact

- **~346 files deleted**, ~30,000 lines removed
- **3 npm dependencies removed**: `pyright`, `tree-sitter`, `tree-sitter-python` (reduces install size and native compilation requirements)
- **CLI interface change**: `--lang` option removed; existing scripts using `--lang python` will break
- **Type system**: `RefactoringDefinition.language` field simplified
- **CI**: Faster test runs (no Python fixture execution, no pyright startup)
- **OpenSpec specs removed**: `python-ast`, `python-codegen`, `python-fixture-runner`
