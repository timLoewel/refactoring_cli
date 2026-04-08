## 1. Parametrize repo configuration

- [x] 1.1 Define `RepoConfig` interface and `REPOS` array in `run.ts` with all 5 repos (typeorm, zod, date-fns, inversify, rxjs) including name, url, ref, and optional installCmd
- [x] 1.2 Add `--repo <name>` CLI arg parsing (default: all repos)
- [x] 1.3 Replace hardcoded `TYPEORM_*` constants and `CACHE_DIR` with per-repo config derivation

## 2. Refactor runner to loop over repos

- [x] 2.1 Extract `ensureCloned()` and `checkBaseline()` to accept a `RepoConfig` parameter
- [x] 2.2 Wrap the main apply loop in an outer repo loop with per-repo daemon start/stop
- [x] 2.3 Aggregate stats per-repo and print cross-repo summary at the end

## 3. Verify repos compile

- [x] 3.1 Run `--dry-run` against each repo to confirm clone, install, and baseline compilation succeed
- [x] 3.2 Fix any repo-specific issues (tsconfig path, install command, etc.) and pin working versions

## 4. Run refactorings and collect failures

- [x] 4.1 Run all refactorings with `--max-candidates 50` against each repo, capture JSON output
- [x] 4.2 Analyze failures: deduplicate by root cause and identify which refactorings have real bugs vs. expected precondition mismatches

## 5. Add failure fixtures

- [x] 5.1 For each confirmed bug, create a minimal `.fixture.ts` reproducing the failure in the relevant `src/refactorings/<name>/fixtures/` directory
- [x] 5.2 Fix bugs in refactoring implementations: split-variable (closure + RHS references), decompose-conditional (this context + outer var mutation), encapsulate-variable (generic type inference), replace-temp-with-query (cross-scope symbol matching)
