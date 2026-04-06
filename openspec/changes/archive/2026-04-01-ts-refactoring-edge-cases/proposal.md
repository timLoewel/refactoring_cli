## Why

Every TypeScript refactoring has exactly one "basic" fixture. The Python side has 5-11 fixtures per refactoring covering import styles, scope edge cases, and language-specific syntax. The TypeScript side needs the same rigor.

Several refactorings also have implementation gaps that are currently hidden by the minimal test coverage: `inline-function` silently removes functions while leaving non-ExpressionStatement call sites broken, `extract-function` can't handle outer-scope variables or return values, and `move-function` doesn't touch imports at all.

## What Changes

Add comprehensive fixture coverage for 4 TypeScript refactorings in priority order, using TDD: write the fixture first, run the test, fix the implementation if it fails.

### Scope

1. **rename-variable** — mostly adding test coverage (ts-morph handles most cases)
2. **inline-function** — tests + significant implementation fixes (parameter substitution, return value handling, preconditions)
3. **extract-function** — tests + implementation work (scope analysis, parameter inference, return value)
4. **move-function** — tests + major implementation work (import handling across files)

### Not in scope

- Refactorings 5-62 (future work, same pattern)
- Python fixture parity (already good)
- New refactorings

## Capabilities

### Modified Capabilities
- `rename-variable`: Add fixture coverage for template literals, shorthand properties, arrow functions, shadowing, closures, typeof, for-of, property-vs-variable distinction
- `inline-function`: Add parameter substitution, return value inlining, arrow function support, preconditions for recursive/generator/async edge cases
- `extract-function`: Add scope analysis for outer variables (→ params), return value inference, nested extraction (not just top-level), async awareness
- `move-function`: Add import carrying, consumer import rewriting, export preservation, type-only import handling

## Impact

- `src/refactorings/rename-variable/` — new fixtures, minor implementation tweaks
- `src/refactorings/inline-function/` — new fixtures, substantial implementation rewrite
- `src/refactorings/extract-function/` — new fixtures, substantial implementation additions
- `src/refactorings/move-function/` — new fixtures, substantial implementation additions
- ESLint config already ignores `**/*.fixture.ts` — no changes needed
- Prettier may format fixture files — acceptable, atypical syntax is still valid TS
