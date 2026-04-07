## ADDED Requirements

### Requirement: Configurable repository list
The test runner SHALL maintain a typed array of repository configurations, each specifying `name`, `url`, `ref`, and optionally `installCmd`. The cache directory SHALL be derived as `tmp/real-codebase/<name>-<ref>/`.

#### Scenario: Default repos include 5 diverse codebases
- **WHEN** the runner is invoked without `--repo`
- **THEN** it SHALL iterate over all configured repos: typeorm, zod, date-fns, inversify, rxjs

### Requirement: Repo selection via CLI flag
The runner SHALL accept a `--repo <name>` flag to run against a single repository.

#### Scenario: Single repo selected
- **WHEN** the runner is invoked with `--repo zod`
- **THEN** it SHALL only clone, baseline, and test against the zod repository

#### Scenario: Unknown repo name
- **WHEN** the runner is invoked with `--repo unknown-name`
- **THEN** it SHALL print an error listing available repo names and exit with non-zero code

#### Scenario: All repos explicitly
- **WHEN** the runner is invoked with `--repo all` or without `--repo`
- **THEN** it SHALL run against every configured repository sequentially

### Requirement: Per-repo install command
Each repo configuration SHALL allow an optional `installCmd` override. If not specified, the runner SHALL default to `npm install --ignore-scripts`.

#### Scenario: Custom install command
- **WHEN** a repo config specifies `installCmd: "yarn install --frozen-lockfile"`
- **THEN** the runner SHALL use that command instead of the default npm install

### Requirement: Per-repo daemon lifecycle
The runner SHALL start a fresh refactoring daemon for each repo and shut it down before moving to the next repo.

#### Scenario: Daemon restart between repos
- **WHEN** the runner finishes testing repo A and moves to repo B
- **THEN** it SHALL close the daemon for repo A and start a new daemon for repo B's project directory
