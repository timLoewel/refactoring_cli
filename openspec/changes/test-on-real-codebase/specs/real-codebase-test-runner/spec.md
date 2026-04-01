## ADDED Requirements

### Requirement: Clone and cache target codebase
The runner SHALL clone a pinned real-world TypeScript repository (TypeORM at a fixed git SHA) into a local cache directory (`tmp/real-codebase/<sha>/`). If the directory already exists, the clone SHALL be skipped.

#### Scenario: First run clones the repo
- **WHEN** the runner is invoked and no cache directory exists for the pinned SHA
- **THEN** the runner clones the repository at that SHA into `tmp/real-codebase/<sha>/`

#### Scenario: Subsequent runs use cache
- **WHEN** the runner is invoked and the cache directory already exists
- **THEN** the runner skips cloning and uses the cached directory

### Requirement: Verify baseline compilation
The runner SHALL verify that the cloned codebase compiles with `tsc --noEmit` before running any applies. If the baseline does not compile, the runner SHALL abort with a clear error message.

#### Scenario: Baseline compiles
- **WHEN** the target codebase compiles cleanly at the pinned SHA
- **THEN** the runner proceeds to the discovery phase

#### Scenario: Baseline does not compile
- **WHEN** `tsc --noEmit` fails on the unmodified target codebase
- **THEN** the runner prints an error identifying the issue and exits with a non-zero code

### Requirement: Discover refactoring targets
For each registered refactoring (or a single one when `--refactoring` is specified), the runner SHALL scan the target codebase and collect all symbols where the refactoring's preconditions pass.

#### Scenario: Targets found
- **WHEN** scanning a codebase that contains symbols matching a refactoring's preconditions
- **THEN** those symbols are collected as candidates for that refactoring

#### Scenario: No targets found
- **WHEN** no symbols in the codebase match a refactoring's preconditions
- **THEN** the refactoring is recorded as "0 targets found" and skipped

### Requirement: Apply candidates in isolation
For each candidate, the runner SHALL copy the working tree to a fresh temp directory, apply the refactoring there, and run `tsc --noEmit`. The original cache MUST remain unmodified between candidates.

#### Scenario: Successful apply and compile
- **WHEN** a refactoring is applied to a candidate and `tsc --noEmit` passes
- **THEN** the candidate is recorded as passed

#### Scenario: Compile failure after apply
- **WHEN** a refactoring is applied to a candidate and `tsc --noEmit` fails
- **THEN** the candidate is recorded as failed with the compiler error message

#### Scenario: CLI crash during apply
- **WHEN** the refactoring CLI throws an error during apply
- **THEN** the candidate is recorded as failed with the error message, and the runner continues to the next candidate

### Requirement: Dry-run mode
When invoked with `--dry-run`, the runner SHALL discover targets and report counts but SHALL NOT apply any refactoring or run `tsc`.

#### Scenario: Dry-run reports targets without applying
- **WHEN** the runner is invoked with `--dry-run`
- **THEN** it prints the number of targets found per refactoring and exits without modifying any files

### Requirement: Summary report
After all candidates are processed, the runner SHALL print a summary table showing per refactoring: targets found, applied, passed, failed. It SHALL also support a `--json` flag that emits the same data as structured JSON.

#### Scenario: Text summary
- **WHEN** the runner completes without `--json`
- **THEN** it prints a table with columns: refactoring name, targets, applied, passed, failed

#### Scenario: JSON output
- **WHEN** the runner is invoked with `--json`
- **THEN** it emits a JSON array where each entry contains: `refactoring`, `targets`, `applied`, `passed`, `failed`, and an array of `failures` with `symbol` and `error`
