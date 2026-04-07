## 1. Deregister Python refactorings

- [x] 1.1 Remove all 66 Python refactoring imports from `src/refactorings/register-all.ts`
- [x] 1.2 Delete all 66 `src/refactorings/*/python.ts` files

## 2. Delete Python fixtures

- [x] 2.1 Delete all `.fixture.py` files from `src/refactorings/*/fixtures/`
- [x] 2.2 Delete all multi-file Python fixture directories (e.g. `move-function/fixtures/*/entry.py` and siblings)

## 3. Delete Python core infrastructure

- [x] 3.1 Delete `src/python/` directory (pyright-client, tree-sitter-parser, python-refactoring-builder, codegen/)

## 4. Remove Python test infrastructure

- [x] 4.1 Delete `src/testing/python-fixture-runner.ts` and `src/testing/__tests__/python-fixture-runner.test.ts`
- [x] 4.2 Delete `src/refactorings/__tests__/all-python-fixtures.test.ts`
- [x] 4.3 Delete `src/refactorings/rename-variable/__tests__/python-rename.test.ts`

## 5. Clean up core types and CLI

- [x] 5.1 Remove `language` field from `RefactoringDefinition` in `src/core/refactoring.types.ts`
- [x] 5.2 Remove `language` assignment from `defineRefactoring` in `src/core/refactoring-builder.ts`
- [x] 5.3 Remove `--lang` option from `src/core/cli/program.ts`
- [x] 5.4 Remove `lang` field from `GlobalOptions` in `src/core/cli/context.ts`
- [x] 5.5 Remove `detectLanguage`, `setupPythonContext`, and language-match logic from `src/core/cli/commands/apply.ts`
- [x] 5.6 Remove any Python references from `src/core/refactoring-registry.ts` (language filtering)

## 6. Remove npm dependencies

- [x] 6.1 Remove `pyright`, `tree-sitter`, `tree-sitter-python` from `package.json` and run `npm install`

## 7. Delete Python OpenSpec specs

- [x] 7.1 Delete `openspec/specs/python-ast/`, `openspec/specs/python-codegen/`, `openspec/specs/python-fixture-runner/`

## 8. Verify

- [x] 8.1 Run `npm run build` — no compilation errors (1 pre-existing fixture error unrelated to this change)
- [x] 8.2 Run `npm test` — all remaining tests pass (18 suites, 327 passed, 0 failures)
- [x] 8.3 Grep for straggler references: `python`, `Python`, `.py`, `tree-sitter`, `pyright` in `src/` — zero found; also cleaned up references in openspec/specs/file-watcher and test-harness
