## ADDED Requirements

### Requirement: PyrightClient wired into CLI apply path
When `refactor apply` is invoked for a Python refactoring, the CLI SHALL construct a `PyrightClient`, create a tree-sitter `Parser`, and call `setPythonContext` before dispatching the apply. After the apply completes, it SHALL call `setPythonContext(null)` and shut down the PyrightClient.

#### Scenario: Single-call Python apply
- **WHEN** `refactor apply rename-variable-python file=foo.py target=x` is run without a daemon
- **THEN** the CLI SHALL construct `PyrightClient(projectRoot)`, await `ensureReady()`, call `setPythonContext({ pyright, parser, projectRoot })`, run the apply, then call `setPythonContext(null)` and `pyright.shutdown()`

#### Scenario: Daemon-mode Python apply
- **WHEN** a Python apply request is received by the daemon
- **THEN** the daemon SHALL use its already-initialized PyrightClient (created at daemon startup) — no per-request PyrightClient construction

#### Scenario: Python context set before apply
- **WHEN** a Python refactoring calls `getPythonContext()` during apply
- **THEN** the context SHALL be non-null and contain a ready PyrightClient, a tree-sitter Parser, and the project root path
