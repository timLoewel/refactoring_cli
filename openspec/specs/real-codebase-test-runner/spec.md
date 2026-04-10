# real-codebase-test-runner Specification

## Purpose
Validate refactorings against real-world TypeScript codebases to catch semantic-preservation failures that fixture tests miss. Applies each refactoring to candidates across multiple open-source repositories, verifying both type-correctness and (where possible) test-suite correctness.

## Requirements

### Requirement: Repository configuration
Each target repository SHALL be defined by a RepoConfig with: name, url, ref (pinned git tag/SHA), optional installCmd, testMode (compile-only or compile-and-test), optional testCmd, optional scopedTestCmd, optional relatedTestsFlag, optional testTimeout, and optional projectSubdir.

#### Scenario: Compile-and-test repo
- **WHEN** a repo has testMode "compile-and-test" with a testCmd and scopedTestCmd
- **THEN** candidates are verified with both type-checking and scoped test execution

#### Scenario: Compile-only repo
- **WHEN** a repo has testMode "compile-only"
- **THEN** candidates are verified with type-checking only, no tests are run

#### Scenario: Monorepo with projectSubdir
- **WHEN** a repo defines projectSubdir (e.g. "packages/remeda")
- **THEN** tsconfig resolution, test execution, and baseline checks use that subdirectory

### Requirement: Multi-repo support
The runner SHALL support a configurable list of repositories. Each repo is processed sequentially. Results are collected per-repo and aggregated across repos.

#### Scenario: All repos run by default
- **WHEN** no --repo flag is provided
- **THEN** all configured repositories are processed

#### Scenario: Unknown repo name
- **WHEN** --repo is given a name not in the config
- **THEN** the runner exits with an error listing available repo names

### Requirement: Clone and cache
The runner SHALL clone each repo at its pinned ref into a cache directory. If the cache already exists with node_modules installed, the clone and install are skipped.

#### Scenario: First run clones and installs
- **WHEN** no cache directory exists for a repo
- **THEN** the runner shallow-clones the repo at the pinned ref and runs npm install

#### Scenario: Subsequent runs use cache
- **WHEN** the cache directory exists with node_modules and tsconfig.json
- **THEN** cloning and installation are skipped

#### Scenario: Custom install command
- **WHEN** a repo defines installCmd
- **THEN** that command is used instead of the default npm ci/install

#### Scenario: Missing tsconfig after clone
- **WHEN** the cloned repo has no tsconfig.json at the expected project directory
- **THEN** the runner aborts with a clear error

### Requirement: Baseline compilation verification
The runner SHALL verify that the target codebase compiles before running any applies. Pre-existing errors are recorded but do not block execution -- they are baselined for filtering.

#### Scenario: Baseline compiles cleanly
- **WHEN** tsc --noEmit passes on the unmodified codebase
- **THEN** the runner proceeds to candidate enumeration

#### Scenario: Baseline has pre-existing errors
- **WHEN** tsc --noEmit fails on the unmodified codebase
- **THEN** the runner warns about pre-existing errors and proceeds (in-process checking will baseline them)

### Requirement: Baseline test verification
For compile-and-test repos, the runner SHALL verify that the repo's test suite passes before using it for semantic testing.

#### Scenario: Baseline tests pass
- **WHEN** testCmd succeeds on the unmodified codebase
- **THEN** tests are enabled for that repo's run

#### Scenario: Baseline tests fail
- **WHEN** testCmd fails on the unmodified codebase
- **THEN** the repo is downgraded to compile-only mode for this run

### Requirement: Candidate enumeration
The runner SHALL enumerate candidates using two modes: generic enumeration (all variable declarations, functions, classes, methods, and properties across all source files) and custom enumeration (when a refactoring provides its own enumerate() function).

#### Scenario: Generic enumeration
- **WHEN** a refactoring does not provide an enumerate() function
- **THEN** all symbols from the ts-morph project are used as candidates

#### Scenario: Custom enumeration
- **WHEN** a refactoring provides an enumerate() function on its registry entry
- **THEN** that function's output is used instead of generic symbol enumeration

### Requirement: Weighted shuffle with seed
Candidates SHALL be shuffled using a seeded weighted-random permutation (exponential-key trick). Weight is inversely proportional to the square of the file's importer count, biasing toward small-scope files. The default seed is 42.

#### Scenario: Deterministic ordering
- **WHEN** the same seed is used across runs
- **THEN** the candidate order is identical

#### Scenario: Small-scope bias
- **WHEN** candidates are shuffled
- **THEN** files with fewer importers appear earlier on average

#### Scenario: Custom seed
- **WHEN** --seed N is provided
- **THEN** the shuffle uses N as the random seed

### Requirement: Daemon mode
The runner SHALL start a persistent refactoring daemon per repo and communicate via a RefactorClient. The daemon's AST is refreshed after each rollback.

#### Scenario: Daemon lifecycle
- **WHEN** a repo run begins
- **THEN** a daemon is started for that repo's project directory and shut down when the repo run completes

#### Scenario: Daemon AST refresh after rollback
- **WHEN** a candidate's changes are rolled back via git
- **THEN** the daemon is notified to refresh the changed files

### Requirement: In-process type-checking
The runner SHALL use ts-morph in-process diagnostics (NOT tsc process spawn) scoped to changed files and their direct importers only. Pre-existing diagnostics are cached and filtered out.

#### Scenario: Scoped checking
- **WHEN** a refactoring changes files A and B
- **THEN** diagnostics are checked on A, B, and all files that directly import A or B

#### Scenario: Baseline diagnostic filtering
- **WHEN** an importer file has pre-existing type errors before any refactoring is applied
- **THEN** those pre-existing errors are excluded from the pass/fail determination

#### Scenario: In-process project refresh
- **WHEN** a refactoring modifies files on disk
- **THEN** the ts-morph project refreshes those files from the filesystem before checking diagnostics

#### Scenario: Refresh fallback on AST corruption
- **WHEN** refreshFromFileSystemSync throws (AST shape changed drastically)
- **THEN** the file is removed and re-added to the ts-morph project

### Requirement: File truncation detection
The runner SHALL detect AST corruption by analyzing git diff. If a diff removes significantly more lines than it adds and ends with "No newline at end of file", the candidate is rolled back early and marked as a type error.

#### Scenario: Truncated file detected
- **WHEN** a diff removes more than 3 lines beyond what it adds and includes "No newline at end of file"
- **THEN** the candidate is marked as failed with "File truncated by AST manipulation" and rolled back immediately

### Requirement: Semantic test execution
For compile-and-test repos, after tsc passes, the runner SHALL run scoped tests against the changed files using the repo's scopedTestCmd.

#### Scenario: Scoped tests pass
- **WHEN** the scoped test command exits 0
- **THEN** the candidate is recorded as fully passed (tsc + tests)

#### Scenario: Scoped tests fail
- **WHEN** the scoped test command exits non-zero with actual test failures
- **THEN** the candidate is recorded as a semantic error (tsc passed, tests failed)

#### Scenario: Test timeout
- **WHEN** the test command exceeds testTimeout (default 30 seconds)
- **THEN** the candidate is recorded as failed with a timeout message

#### Scenario: No tests found
- **WHEN** the test output contains "No test files found", "No tests found", or "No test suite found"
- **THEN** the candidate is treated as passed (no relevant tests exist)

### Requirement: Stale cache detection
If a test error references a file path that was NOT changed by the current refactoring (e.g. a stale vitest/esbuild transform cache), the failure SHALL be treated as a false positive and the candidate marked as passed.

#### Scenario: Error in unchanged file
- **WHEN** a test transform error references a file not in the changed file set
- **THEN** the failure is attributed to stale cache and the candidate is treated as passed

#### Scenario: Error in changed file
- **WHEN** a test transform error references a file that was changed by the refactoring
- **THEN** the failure is treated as a real semantic error

### Requirement: Rollback after every candidate
After each candidate (pass or fail), the runner SHALL roll back all file changes via git checkout, refresh the in-process ts-morph project, and refresh the daemon's AST.

#### Scenario: Rollback restores working tree
- **WHEN** a candidate finishes (regardless of outcome)
- **THEN** git checkout . is run, ts-morph source files are refreshed, and the daemon is notified

### Requirement: CLI flags

#### Scenario: --dry-run
- **WHEN** invoked with --dry-run
- **THEN** repos are cloned and baselines verified, candidate counts are reported, but no refactorings are applied

#### Scenario: --json
- **WHEN** invoked with --json
- **THEN** all output is structured JSON (dry-run reports per-repo candidate counts, full runs report per-repo stats keyed by repo name)

#### Scenario: --verbose
- **WHEN** invoked with --verbose
- **THEN** every candidate attempt is logged, including skipped candidates and their skip reasons

#### Scenario: --skip-tests
- **WHEN** invoked with --skip-tests
- **THEN** all repos are forced to compile-only mode regardless of their testMode

#### Scenario: --refactoring NAME
- **WHEN** invoked with --refactoring NAME
- **THEN** only the named refactoring is tested (others are skipped)

#### Scenario: --max-applies N
- **WHEN** invoked with --max-applies N
- **THEN** each refactoring stops after N valid (applied) candidates; enumeration stops after 20*N candidates checked without reaching N applies

#### Scenario: --repo NAME
- **WHEN** invoked with --repo NAME
- **THEN** only the named repository is tested

#### Scenario: --seed N
- **WHEN** invoked with --seed N
- **THEN** the candidate shuffle uses N as the random seed (default: 42)

### Requirement: CandidateResult tracking
Each candidate SHALL produce a result containing: isTarget, applied, passed, error, skipReason, diff, params, applyMs, tscMs, rollbackMs, scopeFileCount, testsPassed, testError, testMs.

#### Scenario: Precondition failure
- **WHEN** apply throws or returns a precondition failure message
- **THEN** the result has isTarget=false with the skip reason captured

#### Scenario: Apply succeeds and tsc passes
- **WHEN** apply succeeds and no new diagnostics are found
- **THEN** the result has isTarget=true, applied=true, passed=true with timing metrics

#### Scenario: Apply succeeds but tsc fails
- **WHEN** apply succeeds but new diagnostics are found
- **THEN** the result has isTarget=true, applied=true, passed=false with up to 10 diagnostic messages

### Requirement: Reporting
After all candidates are processed, the runner SHALL produce per-repo and cross-repo reports.

#### Scenario: Per-repo stats table
- **WHEN** a repo run completes
- **THEN** a table is printed with columns: Refactoring, Targets, Applied, Passed, TypeErr, SemanticErr

#### Scenario: Cross-repo aggregate table
- **WHEN** multiple repos are run
- **THEN** an aggregate table sums stats across all repos

#### Scenario: Semantic failure summary
- **WHEN** semantic failures (tsc pass, test fail) are found
- **THEN** a deduplicated summary is printed with occurrence counts, suggested fixture paths, params, source context, diff, and test error

#### Scenario: Skip reason analysis
- **WHEN** candidates are skipped due to precondition failures
- **THEN** skip reasons are normalized and counted, with up to 5 top reasons and sample candidates displayed

#### Scenario: JSON output
- **WHEN** --json is active
- **THEN** results are emitted as a JSON object keyed by repo name, each containing an array of RefactoringStats
