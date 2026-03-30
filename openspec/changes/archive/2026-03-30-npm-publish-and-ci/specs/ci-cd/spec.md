## ADDED Requirements

### Requirement: CI on every push and pull request
A GitHub Actions workflow SHALL run lint, build, and test on every push to main and every pull request targeting main.

#### Scenario: PR with passing checks
- **WHEN** a PR is opened against main with valid code
- **THEN** CI runs lint, build, and test jobs, all pass

#### Scenario: PR with failing tests
- **WHEN** a PR is opened with a failing test
- **THEN** CI reports failure and blocks merge (if branch protection is configured)

### Requirement: Node version matrix
CI SHALL test on Node 18 and Node 22.

#### Scenario: Matrix execution
- **WHEN** CI runs
- **THEN** lint, build, and test execute on both Node 18 and Node 22

### Requirement: Automated npm publish on tag
A GitHub Actions workflow SHALL publish to npm when a `v*` tag is pushed.

#### Scenario: Tag-triggered publish
- **WHEN** a `v1.0.0` tag is pushed to the repository
- **THEN** the workflow builds the package and publishes to npm using the `NPM_TOKEN` secret

#### Scenario: No publish on regular push
- **WHEN** code is pushed to main without a tag
- **THEN** only the CI workflow runs, not the publish workflow

### Requirement: GitHub Release creation
The publish workflow SHALL create a GitHub Release from the tag.

#### Scenario: Release created
- **WHEN** the publish workflow completes successfully
- **THEN** a GitHub Release exists with the tag name and auto-generated release notes
