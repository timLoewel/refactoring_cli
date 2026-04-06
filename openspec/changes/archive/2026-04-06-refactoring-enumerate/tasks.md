## 1. Core Infrastructure

- [x] 1.1 Add `enumerate?: (project: Project) => Array<{file: string; target: string}>` to `RefactoringDefinition` in `refactoring.types.ts`
- [x] 1.2 Thread `enumerate` through `defineRefactoring` in `refactoring-builder.ts`
- [x] 1.3 Update test runner to call `enumerate` per-refactoring when present, fall back to generic list otherwise

## 2. extract-variable

- [x] 2.1 Implement `enumerate`: walk all source files, collect identifiers that appear as value expressions (not only as binding positions)
- [x] 2.2 Verify skip rate drops to near zero against TypeORM

## 3. Remaining refactorings

- [x] 3.1 inline-variable
- [x] 3.2 inline-function
- [x] 3.3 rename-variable
- [x] 3.4 extract-function (skipped: no target param, uses startLine/endLine)
- [x] 3.5 replace-temp-with-query
- [x] 3.6 All remaining tier-1/2/3/4 refactorings
