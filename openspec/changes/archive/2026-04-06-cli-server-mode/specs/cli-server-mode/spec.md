## ADDED Requirements

### Requirement: Daemon server with TCP portfile
The `refactor serve --path <projectRoot>` command SHALL start a TCP server on a random port on `127.0.0.1`, load the ts-morph project and PyrightClient once, write a portfile at `<projectRoot>/.refactoring-server` containing `port token`, and serve JSON-RPC 2.0 requests over Content-Length framing until shutdown or idle timeout.

#### Scenario: Daemon starts and writes portfile
- **WHEN** `refactor serve --path /my/project` is executed
- **THEN** the server SHALL bind to a random available port on `127.0.0.1`, generate a random hex token, write `<port> <token>` to `/my/project/.refactoring-server`, and accept TCP connections

#### Scenario: Daemon deletes portfile on exit
- **WHEN** the daemon process exits (via shutdown, SIGTERM, or SIGINT)
- **THEN** the portfile at `<projectRoot>/.refactoring-server` SHALL be deleted

#### Scenario: Daemon self-exits after idle timeout
- **WHEN** no request has been received for 15 minutes
- **THEN** the daemon SHALL close the TCP server, delete the portfile, and exit

#### Scenario: Idle timer resets on each request
- **WHEN** a request completes while the idle timer is running
- **THEN** the idle timer SHALL be reset to 15 minutes

---

### Requirement: JSON-RPC 2.0 wire protocol with Content-Length framing
All messages on a daemon TCP connection SHALL use `Content-Length: N\r\n\r\n` header framing with JSON-RPC 2.0 message envelopes, identical to the LSP base protocol used by `PyrightClient`.

#### Scenario: Well-formed request
- **WHEN** a client sends `Content-Length: 82\r\n\r\n{"jsonrpc":"2.0","id":1,"method":"apply","params":{...}}`
- **THEN** the server SHALL parse the JSON-RPC message and dispatch the method

#### Scenario: Malformed framing
- **WHEN** a client sends data without a valid `Content-Length` header
- **THEN** the server SHALL skip the malformed data without crashing

---

### Requirement: Token-based connection authentication
The first message on each TCP connection MUST be an `initialize` request containing the token from the portfile. The server SHALL reject connections with an invalid token.

#### Scenario: Valid token accepted
- **WHEN** a client sends `initialize` with `{ "token": "<correct-token>" }`
- **THEN** the server SHALL respond with `{ "rootUri": "<projectRoot-as-uri>" }` and accept subsequent requests on this connection

#### Scenario: Invalid token rejected
- **WHEN** a client sends `initialize` with an incorrect token
- **THEN** the server SHALL respond with a JSON-RPC error (code `-32600`) and close the connection

#### Scenario: Request before initialize rejected
- **WHEN** a client sends an `apply` request before `initialize`
- **THEN** the server SHALL respond with a JSON-RPC error (code `-32600`)

---

### Requirement: Apply method dispatches refactorings
The `apply` method SHALL accept params `{ name: string, params: Record<string, unknown>, dryRun?: boolean }` and return the same shape as the CLI JSON output.

#### Scenario: Successful apply
- **WHEN** an `apply` request is sent with valid refactoring name and params
- **THEN** the server SHALL return `{ success: true, filesChanged: [...], description: "...", diff: [...] }`

#### Scenario: Precondition failure
- **WHEN** an `apply` request is sent for a target that does not meet preconditions
- **THEN** the server SHALL return `{ success: false, filesChanged: [], description: "...", diff: [] }`

#### Scenario: Unknown refactoring name
- **WHEN** an `apply` request is sent with a name not in the registry
- **THEN** the server SHALL return a JSON-RPC error (code `-32602`) with message `"Unknown refactoring: <name>"`

#### Scenario: File outside project
- **WHEN** an `apply` request references a file not covered by the loaded tsconfig
- **THEN** the server SHALL return a JSON-RPC error (code `-32602`) with a descriptive message

---

### Requirement: Post-apply source file refresh
After each successful (non-dry-run) apply, the server SHALL refresh the ts-morph project's in-memory AST for all files listed in `result.filesChanged`.

#### Scenario: Changed file refreshed
- **WHEN** an apply modifies `src/foo.ts`
- **THEN** the server SHALL call `refreshFromFileSystem()` on that source file before processing the next request

#### Scenario: New file added to project
- **WHEN** an apply creates a new file not previously in the ts-morph project
- **THEN** the server SHALL call `project.addSourceFileAtPath()` for that file

#### Scenario: Subsequent apply sees updated AST
- **WHEN** a second apply targets a file modified by a previous apply in the same daemon session
- **THEN** the second apply SHALL operate on the updated AST, not the original

---

### Requirement: Shutdown method
The `shutdown` method SHALL gracefully stop the daemon.

#### Scenario: Clean shutdown
- **WHEN** a client sends `shutdown`
- **THEN** the server SHALL stop accepting new connections, let in-flight requests complete, respond with `null`, delete the portfile, and exit the process

---

### Requirement: Transparent daemon lifecycle in apply
Every `refactor apply` invocation SHALL transparently connect to a running daemon (or start one) before dispatching the refactoring. The existing CLI contract SHALL NOT change.

#### Scenario: Daemon already running
- **WHEN** `refactor apply rename-variable file=... target=...` is run and a daemon is already running for this project
- **THEN** the CLI SHALL connect to the daemon via the portfile, send the apply request, print the result, and exit

#### Scenario: No daemon running
- **WHEN** `refactor apply` is run and no portfile exists
- **THEN** the CLI SHALL spawn a daemon process (detached, stdio ignored), wait for the portfile to appear (poll 100ms, max 10s), connect, send the apply request, print the result, and exit

#### Scenario: Stale portfile (crashed daemon)
- **WHEN** `refactor apply` is run and the portfile exists but the daemon is not running (ECONNREFUSED)
- **THEN** the CLI SHALL delete the portfile and spawn a new daemon

#### Scenario: Daemon spawn timeout fallback
- **WHEN** the daemon fails to start within 10s (portfile never appears)
- **THEN** the CLI SHALL fall back to in-process apply (existing behaviour, no regression)

---

### Requirement: Self-spawn mechanism
The daemon SHALL be spawned by re-executing the same binary with the `serve` subcommand. This SHALL work for both `tsx` (dev) and Bun-compiled single binary (prod).

#### Scenario: Dev mode spawn
- **WHEN** `refactor apply` is running via `tsx src/core/cli/index.ts apply ...` and needs to start a daemon
- **THEN** the CLI SHALL spawn `tsx src/core/cli/index.ts serve --path <projectRoot>` as a detached process

#### Scenario: Prod mode spawn
- **WHEN** `refactor apply` is running as a compiled binary and needs to start a daemon
- **THEN** the CLI SHALL spawn `<binaryPath> serve --path <projectRoot>` as a detached process

---

### Requirement: RefactorClient for batch callers
A `RefactorClient` class SHALL provide a programmatic API that holds a TCP connection open across multiple requests, avoiding per-request reconnect overhead.

#### Scenario: Batch apply
- **WHEN** a caller creates `new RefactorClient(projectRoot)` and calls `apply()` multiple times
- **THEN** all requests SHALL be sent over the same TCP connection without reconnecting

#### Scenario: Close without stopping daemon
- **WHEN** a caller calls `client.close()`
- **THEN** the TCP connection SHALL be closed but the daemon SHALL continue running

#### Scenario: Shutdown stops daemon
- **WHEN** a caller calls `client.shutdown()`
- **THEN** the daemon SHALL be stopped via the `shutdown` method
