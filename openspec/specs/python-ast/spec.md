## Purpose
Provide Python AST parsing and LSP integration (via pyright) as the foundation for Python refactoring operations.
## Requirements
### Requirement: LSP server lifecycle management
The system SHALL spawn `pyright-langserver --stdio`, keep it running across multiple operations within a session, and shut it down gracefully on CLI exit.

#### Scenario: Server starts and stays running
- **WHEN** the first Python refactoring command is invoked in a session
- **THEN** pyright-langserver is spawned and remains running for subsequent commands without re-spawning

#### Scenario: Graceful shutdown
- **WHEN** the CLI exits
- **THEN** the system sends LSP `shutdown` + `exit` requests and waits for the process to terminate

#### Scenario: Crash auto-restart
- **WHEN** the pyright process crashes unexpectedly
- **THEN** the next refactoring request auto-restarts the server and succeeds

### Requirement: LSP request support
The system SHALL support the LSP requests needed for Python refactorings.

#### Scenario: Supported requests
- **WHEN** a refactoring requires symbol resolution
- **THEN** the system can issue `textDocument/references`, `textDocument/definition`, `textDocument/hover`, `textDocument/rename`, and `textDocument/prepareRename` requests to pyright

#### Scenario: Initialization delay
- **WHEN** pyright is first started and is still analyzing the project
- **THEN** the system blocks until pyright signals readiness before sending refactoring requests

### Requirement: Python AST parsing and text editing
The system SHALL parse Python files using `tree-sitter-python` and apply text edits using node positions.

#### Scenario: Parse and access CST nodes
- **WHEN** a Python file is loaded
- **THEN** the system can query positional CST nodes by line/column using tree-sitter-python

#### Scenario: Apply text edits without corruption
- **WHEN** a refactoring produces text edits
- **THEN** edits are applied using tree-sitter node positions and surrounding text is not corrupted

### Requirement: Error handling and project detection
The system SHALL fail clearly if pyright is unavailable and auto-detect the Python project root.

#### Scenario: Pyright not installed
- **WHEN** pyright is not installed on the system
- **THEN** the system fails with a clear error message before attempting any refactoring

#### Scenario: Auto-detect project root
- **WHEN** no explicit project root is provided
- **THEN** the system searches upward for `pyproject.toml`, `setup.py`, or `pyrightconfig.json` to determine the root

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

