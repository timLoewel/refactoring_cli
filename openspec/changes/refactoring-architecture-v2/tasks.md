## 1. Builder Infrastructure

- [x] 1.1 Create param helper functions (fileParam, stringParam, identifierParam, numberParam) in `src/engine/refactoring-builder.ts`
- [x] 1.2 Create shared resolvers (resolveSourceFile, resolveFunction, resolveClass, resolveVariable) in `src/engine/refactoring-builder.ts`
- [x] 1.3 Implement `defineRefactoring()` builder that generates ParamSchema, wraps preconditions/apply, and calls `registry.register()`
- [x] 1.4 Tests for builder: param helpers, resolvers, defineRefactoring registration

## 2. Type Cleanup

- [x] 2.1 Remove `diff` field from `RefactoringResult` interface
- [x] 2.2 Update `applyRefactoring()` in apply.ts to not read `diff` from result (already computes from snapshots)
- [x] 2.3 Update CLI `apply` command to source diffs from engine, not from result
- [x] 2.4 Update existing tests that reference `diff` field

## 3. Auto-Discovered Fixture Tests

- [x] 3.1 Add `discoverAllFixtureModules()` to fixture-runner.ts (scans refactoring dirs for fixtures/ subdirs)
- [x] 3.2 Define fixture params convention: fixtures export `params` object alongside `main()`
- [x] 3.3 Create `src/refactorings/__tests__/all-fixtures.test.ts` that auto-discovers and runs all fixtures
- [ ] 3.4 Add params exports to at least 3 existing fixtures (extract-variable, inline-variable, rename-variable) as proof

## 4. Migrate Tier 1 Refactorings (11 modules)

- [ ] 4.1 Migrate extract-variable to use defineRefactoring
- [ ] 4.2 Migrate inline-variable
- [ ] 4.3 Migrate rename-variable
- [ ] 4.4 Migrate replace-temp-with-query
- [ ] 4.5 Migrate split-variable
- [ ] 4.6 Migrate replace-magic-literal
- [ ] 4.7 Migrate slide-statements
- [ ] 4.8 Migrate remove-dead-code
- [ ] 4.9 Migrate introduce-assertion
- [ ] 4.10 Migrate return-modified-value
- [ ] 4.11 Migrate replace-control-flag-with-break

## 5. Migrate Tier 2 Refactorings (29 modules)

- [ ] 5.1 Migrate all 29 Tier 2 refactorings to use defineRefactoring (batch)

## 6. Migrate Tier 3 Refactorings (14 modules)

- [ ] 6.1 Migrate all 14 Tier 3 refactorings to use defineRefactoring (batch)

## 7. Migrate Tier 4 Refactorings (12 modules)

- [ ] 7.1 Migrate all 12 Tier 4 refactorings to use defineRefactoring (batch)

## 8. Remove Barrel and Wire Self-Registration

- [ ] 8.1 Create `src/refactorings/register-all.ts` that imports all 66 modules for side-effect registration
- [ ] 8.2 Remove old barrel `src/refactorings/index.ts` (replace with register-all)
- [ ] 8.3 Update `src/cli/index.ts` to import `register-all.ts` instead of calling `registerAll()`
- [ ] 8.4 Verify all 66 refactorings are discoverable via `registry.listAll()`

## 9. Final Verification

- [ ] 9.1 Run full test suite (all existing tests + auto-discovered fixture tests)
- [ ] 9.2 Verify `tsc --noEmit` passes clean
- [ ] 9.3 Verify roam health >= 60
