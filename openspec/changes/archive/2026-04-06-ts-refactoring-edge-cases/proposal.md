## Why

The refactoring CLI lacks systematic edge-case coverage — each refactoring was built against happy-path scenarios, leaving gaps around operator precedence, scope shadowing, async contexts, multi-file interactions, and dozens of other patterns that real-world TypeScript codebases exhibit. Without fixture-driven coverage of these edges, agent consumers (and humans) can silently produce broken code.

## What Changes

- Add TDD fixture suites for 12 core refactorings (rename-variable, inline-variable, extract-variable, inline-function, extract-function, replace-temp-with-query, replace-loop-with-pipeline, move-function, change-function-declaration, slide-statements, split-variable, rename-field) covering scope, async, type-level, multi-file, and precedence edge cases
- Fix bugs discovered during fixture runs: operator-precedence wrapping in inline-variable, scope analysis in extract-function, return type inference in replace-temp-with-query, nested statement extraction, reference-per-segment tracking in split-variable, and others
- Add fixture coverage pass for 53 remaining refactorings (section 13) with 3-5 edge-case fixtures each, fixing any failures found

## Capabilities

### New Capabilities
- `edge-case-fixtures-core`: TDD fixture suites and bug fixes for the 12 core refactorings (rename-variable through rename-field)
- `edge-case-fixtures-remaining`: Fixture coverage pass for 53 remaining refactorings (parameterize-function through return-modified-value)

### Modified Capabilities

## Impact

- All refactoring modules under `src/refactorings/` gain new `.fixture.ts` test files
- Bug fixes touch core transformation logic in inline-variable, extract-function, replace-temp-with-query, split-variable, and others
- No API or CLI interface changes — all changes are internal correctness improvements
- Test count increases substantially (~200+ new fixture files)
