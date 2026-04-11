## ADDED Requirements

### Requirement: Stop on first failure
When invoked with `--stop-on-first-failure`, the runner SHALL stop processing candidates as soon as a syntax error (tsc failure) or semantic error (test failure) is encountered. The failure details SHALL be written to stdout as a JSON object and the process SHALL exit with code 1.

#### Scenario: Syntax failure triggers stop
- **WHEN** `--stop-on-first-failure` is active and a candidate produces a tsc failure
- **THEN** the runner outputs a FailureReport JSON to stdout and exits with code 1

#### Scenario: Semantic failure triggers stop
- **WHEN** `--stop-on-first-failure` is active and a candidate passes tsc but fails tests
- **THEN** the runner outputs a FailureReport JSON to stdout and exits with code 1

#### Scenario: Precondition rejection does not trigger stop
- **WHEN** `--stop-on-first-failure` is active and a candidate is rejected by preconditions
- **THEN** the runner skips the candidate and continues to the next one

#### Scenario: Successful apply does not trigger stop
- **WHEN** `--stop-on-first-failure` is active and a candidate is applied successfully (tsc passes, tests pass)
- **THEN** the runner continues to the next candidate

#### Scenario: FailureReport JSON format
- **WHEN** a failure triggers a stop
- **THEN** the JSON contains: `refactoring` (string), `repo` (string), `candidate` ({file, target}), `params` (object), `sourceBefore` (string, ~20 lines around target), `diff` (string, unified diff), `error` (string, compiler or test error), `errorType` ("syntax" | "semantic"), `candidatesTestedSoFar` (number)

#### Scenario: Clean exit when no failures
- **WHEN** `--stop-on-first-failure` is active and all candidates are tested without failure
- **THEN** the runner exits with code 0 and outputs a summary JSON with `{ success: true, candidatesTested: N }`

### Requirement: Candidate tried-set persistence
The runner SHALL support a `--tried-set-file <path>` flag. When provided, the runner loads a JSON file mapping `"repo::file::target"` keys to `true`. Already-tried candidates are excluded from the pool before shuffling. After each candidate is processed (regardless of outcome), its key is appended to the tried-set file.

#### Scenario: First run with empty tried-set
- **WHEN** `--tried-set-file` points to a nonexistent or empty file
- **THEN** all candidates are in the pool and the file is created on first write

#### Scenario: Resume with existing tried-set
- **WHEN** `--tried-set-file` points to a file with 200 entries for repo "zod"
- **AND** the repo "zod" has 5000 candidates
- **THEN** 4800 candidates remain in the pool after filtering

#### Scenario: Tried-set updated after each candidate
- **WHEN** a candidate is processed (skip, pass, or fail)
- **THEN** its `"repo::file::target"` key is added to the tried-set file before the next candidate

#### Scenario: Tried-set does not affect other repos
- **WHEN** the tried-set contains entries for repo "zod" and the runner processes repo "date-fns"
- **THEN** all "date-fns" candidates are in the pool (zod entries are ignored)

#### Scenario: Pool exhaustion
- **WHEN** all candidates for a refactoring on a repo are in the tried-set
- **THEN** the runner logs "no untried candidates remain" and moves to the next repo (exit 0)

### Requirement: Expanded repository list
The runner SHALL include at least 10 additional compile-and-test repositories beyond the current set. Each new repo MUST have: a pinned git tag, a working test suite (vitest or jest), and a scopedTestCmd for targeted test execution.

#### Scenario: New repo compiles and tests pass
- **WHEN** a newly added repo is cloned and installed
- **THEN** baseline compilation passes and baseline tests pass

#### Scenario: New repo has scoped test support
- **WHEN** a newly added repo is configured
- **THEN** it has both testCmd and scopedTestCmd defined

## MODIFIED Requirements

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
- **THEN** each refactoring stops after N valid (applied) candidates; enumeration stops after 20*N candidates checked without reaching N applies (default: 500)

#### Scenario: --repo NAME
- **WHEN** invoked with --repo NAME
- **THEN** only the named repository is tested

#### Scenario: --seed N
- **WHEN** invoked with --seed N
- **THEN** the candidate shuffle uses N as the random seed (default: 42)

#### Scenario: --stop-on-first-failure
- **WHEN** invoked with --stop-on-first-failure
- **THEN** the runner stops on the first syntax or semantic failure, outputs a FailureReport JSON, and exits with code 1

#### Scenario: --tried-set-file PATH
- **WHEN** invoked with --tried-set-file PATH
- **THEN** already-tried candidates are excluded from the pool and new candidates are appended after processing

## MODIFIED Requirements

### Requirement: Weighted shuffle with seed
Candidates SHALL be shuffled using a seeded weighted-random permutation (exponential-key trick). Weight is inversely proportional to the square of the file's importer count, biasing toward small-scope files. The default seed is 42. Candidates present in the tried-set (if loaded) SHALL be removed from the pool before shuffling.

#### Scenario: Deterministic ordering
- **WHEN** the same seed is used across runs
- **THEN** the candidate order is identical (for the same pool of untried candidates)

#### Scenario: Small-scope bias
- **WHEN** candidates are shuffled
- **THEN** files with fewer importers appear earlier on average

#### Scenario: Custom seed
- **WHEN** --seed N is provided
- **THEN** the shuffle uses N as the random seed

#### Scenario: Tried candidates excluded before shuffle
- **WHEN** a tried-set file is loaded with 300 entries for the current repo
- **THEN** those 300 candidates are removed before the weighted shuffle runs
