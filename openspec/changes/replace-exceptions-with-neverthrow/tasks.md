## 1. Dependencies and scaffolding

- [x] 1.1 Add `neverthrow` to `dependencies` in `package.json` and install
- [x] 1.2 Add `eslint-plugin-functional` and `eslint-plugin-neverthrow` to `devDependencies` and install
- [x] 1.3 Create `src/core/errors.ts` with error types (`ParamError`, `ProjectError`, `RegistryError`, `ConnectionError`, `FixtureError`, `CoreError`) and named Result aliases (`ParamResult<T>`, `ProjectResult<T>`, `RegistryResult<T>`, `ConnectionResult<T>`, `FixtureResult<T>`)

## 2. Core module migration

- [ ] 2.1 Refactor `src/core/refactoring-builder.ts` param validators (`fileParam`, `stringParam`, `identifierParam`, `numberParam`) to return `ParamResult<T>` instead of throwing; update `buildParamSchema` and `ParamSchema.validate` to return `ParamResult`
- [ ] 2.2 Replace the ad-hoc `ResolveResult<T>` discriminated union in `refactoring-builder.ts` with `Result<T, CoreError>` from neverthrow
- [ ] 2.3 Update `defineRefactoring` internals (`preconditions`, `apply`) to unwrap param validation and resolver Results
- [ ] 2.4 Refactor `src/core/project-model.ts` — `resolveTsConfig` and `loadProject` return `ProjectResult<ProjectModel>` instead of throwing
- [ ] 2.5 Refactor `src/core/refactoring-registry.ts` — `register()` returns `RegistryResult<void>` instead of throwing on duplicates
- [ ] 2.6 Refactor `src/core/refactor-client.ts` — `RefactorClient.connect()` returns `ConnectionResult<RefactorClient>` instead of throwing
- [ ] 2.7 Refactor `src/core/apply.ts` — replace ad-hoc `tryApply`/`trySave` with `Result.fromThrowable()` wrappers, align return type with `Result`

## 3. CLI command handler updates

- [ ] 3.1 Update `src/core/cli/commands/apply.ts` — `inProcessApply` unwraps `loadProject` Result, handle err cases with `errorOutput`
- [ ] 3.2 Update remaining CLI commands (`search.ts`, `references.ts`, `unused.ts`, `fix-imports.ts`) to unwrap `loadProject` Result
- [ ] 3.3 Update `src/core/cli/commands/apply.ts` — `tryDaemonApply` to handle `ConnectionResult`

## 4. Test infrastructure migration

- [ ] 4.1 Refactor `src/testing/fixture-runner.ts` — replace 6 throw sites with `FixtureResult<T>` returns
- [ ] 4.2 Update `src/testing/fixture-runner.test.ts` — assert on `Result.err` values instead of expecting thrown errors
- [ ] 4.3 Update `src/core/apply.test.ts` — adjust test assertions to match new Result-based returns
- [ ] 4.4 Update `src/core/type-params.test.ts` — replace test-internal throws with assertions or Result unwraps

## 5. ESLint configuration

- [ ] 5.1 Add `eslint-plugin-functional` `configs.noExceptions` to `eslint.config.mjs`
- [ ] 5.2 Add `eslint-plugin-neverthrow` `configs.recommended` to `eslint.config.mjs`
- [ ] 5.3 Add ESLint override for `**/*.test.ts`, `**/*.fixture.ts` to disable `functional/no-throw-statements` and `functional/no-try-statements`
- [ ] 5.4 Add ESLint override for `src/core/cli/commands/*.ts` and `src/core/server/*.ts` to disable `functional/no-try-statements` (boundary files)
- [ ] 5.5 Run `npm run lint` and fix any remaining violations

## 6. Documentation and verification

- [ ] 6.1 Add "Error Handling" paragraph to CLAUDE.md under Coding Conventions prescribing neverthrow usage
- [ ] 6.2 Run full test suite (`npm test`) and fix any failures
- [ ] 6.3 Run `npm run lint` to confirm zero ESLint errors with new rules
