## Context

The project currently supports two languages: TypeScript (via ts-morph) and Python (via tree-sitter + pyright + inline Python scripts). Python support spans ~346 files and ~30,000 lines across every layer: types, registry, CLI, refactoring implementations, test infrastructure, and OpenSpec specs.

Python support was added experimentally but after exploring the full scope of Python's syntax variation, the decision is to remove it and focus on TypeScript.

## Goals / Non-Goals

**Goals:**
- Remove all Python-related code, tests, fixtures, and specs
- Remove Python-specific npm dependencies (`pyright`, `tree-sitter`, `tree-sitter-python`)
- Simplify the type system by removing the `language` field from `RefactoringDefinition`
- Remove the `--lang` CLI option
- Keep all TypeScript refactoring functionality exactly as-is

**Non-Goals:**
- Redesigning the refactoring builder or registry (keep changes minimal)
- Adding new TypeScript features to fill the gap
- Preserving any Python code "just in case" — clean removal

## Decisions

### 1. Remove `language` field entirely vs constrain to `"typescript"`

**Decision:** Remove the field from `RefactoringDefinition`. Every remaining refactoring is TypeScript, so the field carries no information.

**Alternative considered:** Keep `language: "typescript"` as a literal on every definition. Rejected because it's noise — if we add another language later, we'd re-add the field then.

**Consequence:** The TypeScript `defineRefactoring` builder in `refactoring-builder.ts` stops setting `language`. The registry stops filtering by language. The apply command stops checking language match.

### 2. Remove `--lang` CLI option entirely vs keep it as no-op

**Decision:** Remove it. A dead option confuses users and agents.

**Consequence:** `GlobalOptions` loses the `lang` field. The `detectLanguage` function in `apply.ts` is deleted. The apply command path simplifies to always-TypeScript.

### 3. Remove `tree-sitter` dependency entirely

**Decision:** Remove `tree-sitter` and `tree-sitter-python`. tree-sitter is only used for Python parsing — no TypeScript refactorings use it.

**Consequence:** No native compilation dependency for tree-sitter on install. Simpler CI.

### 4. Delete Python OpenSpec specs vs archive them

**Decision:** Delete `openspec/specs/python-ast/`, `openspec/specs/python-codegen/`, `openspec/specs/python-fixture-runner/`. They describe removed functionality and have no archival value — git history preserves them if needed.

### 5. Deletion order

**Decision:** Bottom-up deletion to keep the build green at each step:
1. Remove imports from `register-all.ts` (breaks the registration, but nothing references Python refactorings from TS code)
2. Delete `src/refactorings/*/python.ts` files and `.py` fixtures
3. Delete `src/python/` directory
4. Clean up core types, CLI, and test infrastructure
5. Remove npm dependencies
6. Delete OpenSpec specs

## Risks / Trade-offs

- **[Risk] Missed reference** → Run `grep -r "python\|Python\|\.py" src/` after deletion to catch stragglers. Also run `npm run build` and `npm test` to verify nothing breaks.
- **[Risk] Breaking external consumers** → The `--lang` CLI option removal is breaking. Mitigated by the fact that Python support was never released — no external consumers exist.
- **[Risk] tree-sitter used elsewhere** → Verified: tree-sitter is only used in `src/python/tree-sitter-parser.ts`. Safe to remove.
