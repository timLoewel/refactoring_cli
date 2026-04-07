## MODIFIED Requirements

### Requirement: Clone and cache target codebase
The runner SHALL clone a pinned real-world TypeScript repository into a local cache directory (`tmp/real-codebase/<name>-<ref>/`). If the directory already exists with a tsconfig.json and node_modules, the clone SHALL be skipped. The runner SHALL support multiple repositories, each cloned and cached independently.

#### Scenario: First run clones the repo
- **WHEN** the runner is invoked and no cache directory exists for a configured repo
- **THEN** the runner clones the repository at the pinned ref into `tmp/real-codebase/<name>-<ref>/`

#### Scenario: Subsequent runs use cache
- **WHEN** the runner is invoked and the cache directory already exists with tsconfig.json and node_modules
- **THEN** the runner skips cloning and uses the cached directory

#### Scenario: Multiple repos each cached independently
- **WHEN** the runner is configured with multiple repos
- **THEN** each repo has its own cache directory and clone/install lifecycle

### Requirement: Summary report
After all candidates are processed, the runner SHALL print a summary table showing per refactoring: targets found, applied, passed, failed. When multiple repos are tested, the runner SHALL print per-repo summaries followed by a cross-repo aggregate. It SHALL support a `--json` flag that emits the same data as structured JSON.

#### Scenario: Text summary for multiple repos
- **WHEN** the runner completes testing multiple repos without `--json`
- **THEN** it prints a per-repo summary table and a final aggregate table

#### Scenario: JSON output for multiple repos
- **WHEN** the runner is invoked with `--json` and multiple repos
- **THEN** it emits a JSON object keyed by repo name, each containing the per-refactoring stats array
