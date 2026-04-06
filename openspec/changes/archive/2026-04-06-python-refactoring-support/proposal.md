## Why

The CLI currently only supports TypeScript refactorings. The same Fowler catalog refactorings are valuable for Python codebases, and having them in a single CLI avoids requiring users to install and learn separate tools per language.

## What Changes

- Add pyright LSP client for Python type analysis, reference finding, and import resolution
- Add tree-sitter-python for CST parsing and source text manipulation
- Add a Python fixture runner (executes .py files, checks semantic preservation like the TS runner)
- Add `definePythonRefactoring` builder parallel to `defineRefactoring`, with a Python-specific project context
- Extend CLI with `--lang` flag and auto-detection from file extension
- Implement Python refactorings incrementally: two vertical slices first, then remaining catalog

## Capabilities

### New Capabilities
- `python-ast`: Pyright LSP client + tree-sitter-python integration for parsing, type queries, and source manipulation
- `python-fixture-runner`: Semantic preservation testing for Python refactorings (parallel to TS fixture runner)
- `python-refactorings`: Python implementations of Fowler catalog refactorings
- `python-codegen`: Import statement generation, annotation preservation, and source text assembly for Python

### Modified Capabilities
- `cli-framework`: Language detection (--lang flag, file extension auto-detect), routing to correct refactoring implementation

## Impact

- New npm dependencies: `tree-sitter`, `tree-sitter-python`, `pyright` (or drive system-installed pyright)
- New runtime requirement: Python 3.10+ installed on user's machine (for pyright to analyze, and for fixture tests to execute)
- `src/core/` — new Python builder, LSP client, language detection
- `src/refactorings/` — Python fixture files (.py) alongside existing TS fixtures
- Test suite — Python fixture runner + all-python-fixtures.test.ts
- Binary size increase from tree-sitter native bindings
