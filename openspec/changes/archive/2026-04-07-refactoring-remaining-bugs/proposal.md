## Why

Real-codebase testing (TypeORM, 50 candidates per refactoring) revealed categories of bugs that require larger architectural changes — unused import cleanup, cross-scope variable handling, and AST manipulation robustness. Additionally, the Python refactoring tests have isolation issues that mask potential bugs. These should be tracked and addressed systematically.

## What Changes

- Add post-transformation unused import/variable cleanup pass usable by all refactorings
- Fix AST manipulation crashes in inline-variable and replace-inline-code-with-function-call
- Improve type inference for extracted functions (avoid `unknown` fallback)
- Fix argument count/type mismatches in class hierarchy refactorings
- Fix Python test isolation issues (tree-sitter parser resource sharing)
- Improve extract-function enumerate to provide valid line ranges

## Capabilities

### New Capabilities
- `unused-cleanup`: Post-transformation pass to remove unused imports and variables left by refactorings
- `ast-manipulation-robustness`: Safer AST mutation patterns to avoid syntax error crashes and stale node references

### Modified Capabilities
- `refactoring-engine`: Type inference improvements (context-relative types, fewer `unknown` fallbacks)
- `test-harness`: Python test isolation fixes, extract-function enumerate providing line ranges

## Impact

- `src/core/` — new shared cleanup utility
- `src/refactorings/` — multiple refactoring implementations adopt cleanup pass
- `src/testing/` — fixture runner and Python test infrastructure
- `src/python/` — tree-sitter parser lifecycle management
