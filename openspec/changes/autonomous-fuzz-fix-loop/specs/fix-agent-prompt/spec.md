## ADDED Requirements

### Requirement: Failure input format
The fix agent SHALL receive a JSON object on stdin containing: `refactoring` (kebab-case name), `repo` (repo name), `candidate` (file + target), `params` (applied params), `sourceBefore` (source context around the target), `diff` (unified diff of the failed transformation), `error` (compiler error messages or test error output), `errorType` ("syntax" or "semantic").

#### Scenario: Syntax error input
- **WHEN** the runner reports a tsc failure
- **THEN** the agent receives errorType "syntax" with compiler diagnostic messages in `error`

#### Scenario: Semantic error input
- **WHEN** the runner reports a test failure (tsc passed)
- **THEN** the agent receives errorType "semantic" with test output in `error`

### Requirement: Fixture creation
The fix agent SHALL create a minimal fixture file that reproduces the failure. The fixture MUST follow the project's existing fixture conventions (export `params`, export `main()` that returns a deterministic value).

#### Scenario: Fixture file location
- **WHEN** the agent creates a fixture for refactoring "extract-variable"
- **THEN** the fixture is written to `src/refactorings/extract-variable/fixtures/<descriptive-name>.fixture.ts`

#### Scenario: Fixture reproduces the failure
- **WHEN** the fixture is created and tests are run
- **THEN** the test for the new fixture fails with the same category of error (syntax or semantic mismatch)

#### Scenario: Minimal fixture
- **WHEN** the agent creates a fixture from real-world source code
- **THEN** the fixture contains only the minimal code necessary to trigger the failure (not a copy of the full source file)

### Requirement: Code fix
After creating the failing fixture, the fix agent SHALL modify the refactoring's implementation to handle the edge case. The fix MUST make the new fixture test pass without breaking existing fixtures.

#### Scenario: Fix makes new test pass
- **WHEN** the agent modifies the refactoring code
- **THEN** the new fixture's test passes (either correct transformation or precondition rejection)

#### Scenario: Fix preserves existing tests
- **WHEN** the agent modifies the refactoring code
- **THEN** all pre-existing fixture tests for that refactoring still pass

#### Scenario: Precondition rejection is acceptable
- **WHEN** the failure represents a case the refactoring cannot safely handle
- **THEN** the agent MAY add a precondition check that rejects the candidate (with `expectRejection: true` in the fixture params)

### Requirement: Quality checks
Before committing, the fix agent SHALL run `npm run lint`, `npm run build`, and `npm test` and verify all pass.

#### Scenario: All checks pass
- **WHEN** lint, build, and test all exit 0
- **THEN** the agent proceeds to commit

#### Scenario: Check failure
- **WHEN** any quality check fails
- **THEN** the agent fixes the issue and re-runs all checks (up to 3 attempts)

#### Scenario: Stuck after retries
- **WHEN** quality checks still fail after 3 attempts
- **THEN** the agent reverts all changes, outputs a structured "stuck" report, and exits non-zero

### Requirement: Commit convention
The fix agent SHALL commit with a semantic message following the pattern `fix(<refactoring-name>): <description of edge case>`. Only files under the refactoring's directory SHALL be staged, unless shared code changes are necessary.

#### Scenario: Commit message format
- **WHEN** the agent fixes an edge case in extract-variable involving arrow functions
- **THEN** the commit message is like `fix(extract-variable): handle arrow function with implicit return`

#### Scenario: Scoped staging
- **WHEN** the fix only changes files under `src/refactorings/extract-variable/`
- **THEN** only those files are staged

#### Scenario: Shared code change
- **WHEN** the fix requires changing a shared module (e.g., `src/core/symbol-resolver.ts`)
- **THEN** the shared file is also staged and the commit message notes the shared change

### Requirement: Agent output
The fix agent SHALL output a structured JSON result on stdout containing: `success` (boolean), `fixturePath` (path to created fixture), `filesChanged` (list of modified files), `commitHash` (if successful), `stuckReport` (if failed).

#### Scenario: Successful fix
- **WHEN** the agent completes fixture + fix + commit
- **THEN** output has `success: true` with commitHash and fixturePath

#### Scenario: Agent stuck
- **WHEN** the agent cannot fix the issue after retries
- **THEN** output has `success: false` with stuckReport describing what was tried

### Requirement: Headless execution
The fix agent SHALL run as a headless `claude --print` session with `--dangerously-skip-permissions`. No user interaction is possible during execution.

#### Scenario: No interactive prompts
- **WHEN** the agent runs
- **THEN** it never waits for user input; all decisions are autonomous

#### Scenario: System prompt
- **WHEN** the agent is invoked
- **THEN** it receives a system prompt with the failure JSON, the project's coding conventions, and instructions to create fixture then fix
