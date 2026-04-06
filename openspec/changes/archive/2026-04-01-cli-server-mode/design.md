## Context

Every `refactor apply` call currently spawns a fresh process that:
1. Calls `loadProject()`, which constructs a new ts-morph `Project` and parses all TypeScript source files (~40s on TypeORM)
2. For Python refactorings, also spawns a Pyright subprocess and runs the full LSP `initialize` handshake — but this never happens in production because `setPythonContext` is never called from `apply.ts`

Both problems share the same root: no persistent state between CLI invocations. A long-lived daemon process loads the project once and serves many `apply` requests without reloading.

**Existing infrastructure to build on:**

`PyrightClient` (`src/python/pyright-client.ts`) is a complete implementation of an LSP client over stdio. It uses `Content-Length: N\r\n\r\n` header framing and JSON-RPC 2.0 message envelopes. The `RefactorServer` and `RefactorClient` use exactly the same wire protocol.

`ApplyResult.filesChanged` lists every file path written to disk by a successful apply. The server uses this to invalidate only those source files in the ts-morph project after each request, avoiding a full project reload.

`PythonProjectContext` (`{ pyright: PyrightClient, parser: Parser, projectRoot: string }`) is the interface Python refactorings already expect. `setPythonContext` is the module-level setter. Wiring this up in `apply.ts` (single-call) and in the server (persistent) is the Python repair.

**Reference implementation: `core_d.js`** (used by `eslint_d`, `prettier_d`)

`core_d.js` is a minimal daemon framework for Node.js CLI tools. Its architecture maps directly to our requirements:

- **Portfile** (`<dir>/<dotfile>`): contains `port token`, written by daemon at startup, deleted on exit
- **Daemon spawn**: `spawn('node', [daemon], { detached: true, stdio: ['ignore','ignore','ignore'] }); child.unref()` — parent exits immediately, daemon lives independently
- **Client connect**: read portfile → `net.connect(port, '127.0.0.1')` → send `token {json}` → read response
- **Stale detection**: `ECONNREFUSED` on connect → delete portfile → start fresh (no PID needed)
- **No idle timeout in core_d itself** — service layer responsibility

Source at `/tmp/core_d/lib/` — the full implementation is ~200 lines across 7 files.

## Goals / Non-Goals

**Goals:**
- Persistent daemon mode: `refactor serve --path <root>` starts a TCP server on a random port (127.0.0.1), loads ts-morph project + PyrightClient once, writes portfile, serves `apply` requests over JSON-RPC 2.0 with Content-Length framing
- Transparent daemon lifecycle: every `refactor apply` invocation reads the portfile, connects to the running daemon (or starts one), sends the request, and exits — no user-visible change to the CLI contract
- `RefactorClient` class: programmatic API for batch callers (test runner, agent loops) that holds a TCP connection open across multiple requests
- Python repair: `setPythonContext` wired into production code — in single-call mode (no daemon) a PyrightClient is constructed per call; in daemon mode it lives with the server
- Post-apply source file refresh: `refreshFromFileSystem()` on changed files
- Idle timeout: daemon self-exits after 15 min of inactivity
- Self-spawn: daemon is started by re-executing the same binary with `serve` — works for both `tsx` (dev) and single-binary (Deno compile, prod)

**Non-Goals:**
- No multi-project server — one daemon per project root
- No file watching — the server reads from disk after each apply, not proactively
- No changes to the refactoring definitions or engine — only the CLI layer and transport
- No `textDocument/didChange` notifications for TypeScript — ts-morph refreshes from disk

## Decisions

### Decision 1: TCP daemon with portfile (following `core_d` pattern)

The daemon binds to a random TCP port on `127.0.0.1` and writes a portfile at `<projectRoot>/.refactoring-server` containing `port token`.

```
54821 a3f7c9e1b2d04f68
```

The portfile is:
- Written by the daemon at startup after `server.listen()` resolves
- Deleted on `process.on('exit')` (and `SIGTERM`, `SIGINT`)
- Git-ignored (added to `.gitignore`)

**Stale detection** is purely connection-based: if `net.connect` returns `ECONNREFUSED`, the portfile is deleted and a new daemon is spawned. No PID stored — no PID reuse ambiguity.

**Why TCP over Unix sockets?** Cross-platform (Windows compatibility for future Bun single-binary distribution). `core_d` uses the same approach.

**Why not stdio?** Stdio requires the client to be the parent process. With a daemon, the spawning process exits immediately — there is no parent to hold the pipe. TCP allows any process to connect at any time.

### Decision 2: LSP framing + JSON-RPC 2.0 over the TCP connection

Once connected, the TCP stream uses `Content-Length: N\r\n\r\n` header framing and JSON-RPC 2.0 message envelopes — identical to `PyrightClient`'s transport layer. The framing parser from `PyrightClient` can be extracted and reused.

The message shapes:
- Request: `{ jsonrpc: "2.0", id: number, method: string, params: unknown }`
- Response: `{ jsonrpc: "2.0", id: number, result: unknown }` or `{ jsonrpc: "2.0", id: number, error: { code: number, message: string } }`
- Notification: `{ jsonrpc: "2.0", method: string, params: unknown }` (no `id`)

**Alternative: raw text protocol like `core_d`** (`token {json}`) — simpler but inconsistent with our existing `PyrightClient` protocol. Using the same framing everywhere means one implementation, one mental model.

### Decision 3: Methods

| Method | Direction | Purpose |
|---|---|---|
| `initialize` | client → server | First message on each connection. Params: `{ token: string }`. Server validates token; rejects connection if wrong. Returns `{ rootUri: string }`. |
| `apply` | client → server | Params: `{ name: string, params: Record<string, unknown>, dryRun?: boolean }`. Returns same shape as CLI JSON output (`{ success, filesChanged, description, diff }`). |
| `shutdown` | client → server | Graceful daemon teardown: closes TCP server, exits. Returns `null`. |

The `initialize` method serves double duty: it validates the security token AND returns the project root so the client can confirm it connected to the right daemon.

**Differences from the LSP handshake:** no `initialized` notification, no capabilities negotiation — unnecessary complexity for a fixed protocol between our own client and server. `shutdown` stops the daemon entirely (not just the connection).

**Connection lifecycle:** Each connection to the daemon is independent. A client connects, sends `initialize`, sends one or more `apply` requests, then disconnects (TCP close). The daemon stays alive. `RefactorClient` (batch mode) holds one connection open; `apply.ts` (single-call) connects and disconnects per invocation.

### Decision 4: "Start or connect" algorithm in `apply.ts`

Every `refactor apply` call runs this before dispatching the refactoring:

```
portfilePath = join(projectRoot, '.refactoring-server')

1. Read portfile
   - Not found → go to step 3
   - Found     → parse port + token

2. Connect to TCP port
   - Success → send initialize(token) → return connection
   - ECONNREFUSED → delete portfile → go to step 3

3. Spawn daemon:
     spawn(process.execPath, [...execArgv, cliEntrypoint, 'serve', '--path', projectRoot],
           { detached: true, stdio: ['ignore','ignore','ignore'] })
     child.unref()

4. Poll portfile (100ms interval, max 10s timeout)
   - Portfile appears → read port + token → connect → send initialize(token) → return connection
   - Timeout → fall back to in-process apply (no daemon)
```

The self-spawn uses `process.execPath` and `process.argv[1]` (the CLI entrypoint) to reconstruct the invocation. This works for both `tsx src/core/cli/index.ts` (dev) and a Bun-compiled single binary (prod), since both follow the pattern `<runtime> <entrypoint> <subcommand>`.

**Fallback:** If the daemon fails to start within 10s, the CLI falls back to the existing in-process apply (no behaviour regression). This makes the daemon an optimistic acceleration, not a hard dependency.

### Decision 5: Idle timeout (15 min)

The daemon maintains a timer reset on each completed request (any method). After 15 minutes of inactivity, the daemon calls `server.close()`, which:
- Stops accepting new connections
- Lets in-flight requests complete
- Triggers `process.on('exit')` → portfile deleted

```typescript
const IDLE_TIMEOUT_MS = 15 * 60 * 1000;
let idleTimer: NodeJS.Timeout;

function resetIdleTimer(): void {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => server.close(), IDLE_TIMEOUT_MS);
}
```

### Decision 6: Post-apply source file refresh

After each successful `apply`, `result.filesChanged` lists every file written to disk. The server calls:

```typescript
for (const filePath of result.filesChanged) {
  project.getSourceFile(filePath)?.refreshFromFileSystem();
}
```

If a refactoring creates new files (not yet in the project), the server calls `project.addSourceFileAtPath(filePath)` for those. Removed files are handled via `project.getSourceFile(filePath)?.forget()`.

### Decision 7: Files outside the project return a JSON-RPC error

If a requested file is not in the ts-morph project (not covered by `tsconfig.json`), the server returns a JSON-RPC error response with code `-32602` (Invalid Params). The client surfaces this as an `Error`. No crash.

### Decision 8: Python repair — PyrightClient wired into production

**Single-call mode** (no daemon): `apply.ts` detects `lang === "python"`, constructs `PyrightClient(projectRoot)`, awaits `ensureReady()`, calls `setPythonContext({ pyright, parser: createPythonParser(), projectRoot })`, runs the apply, then calls `setPythonContext(null)` and `pyright.shutdown()`. Adds ~1–2s per call but makes Python refactorings actually work.

**Daemon mode**: the daemon creates `PyrightClient` once during startup alongside the ts-morph project. `setPythonContext` is called once. Both stay alive for the daemon's lifetime. After each Python apply, changed `.py` files are communicated to Pyright's in-memory state.

### Decision 9: `RefactorClient` for batch callers

`RefactorClient` is a class for programmatic use (test runner, agent loops). It:
- Runs the same "start or connect" algorithm as `apply.ts`
- Holds the TCP connection open across multiple `apply()` calls (avoids per-request reconnect)
- Exposes `async apply(name, params, options)` → `ApplyResult`
- Exposes `async shutdown()` → stops the daemon
- Exposes `async close()` → disconnects without stopping the daemon

The test runner creates one `RefactorClient`, sends all applies through it, then calls `close()`.

## Risks / Trade-offs

**[Risk] Daemon becomes stale if files are changed outside the server** → Mitigation: out of scope. The `refreshFromFileSystem` call after each apply handles the expected mutation path. External changes (user editing files while the daemon runs) may cause stale AST; the daemon's 15 min idle timeout limits the window.

**[Risk] Port collision on 127.0.0.1** → Mitigation: `server.listen(0)` lets the OS assign an available port. No collision possible.

**[Risk] Portfile left behind after unclean daemon exit (kill -9, power loss)** → Mitigation: stale detection via `ECONNREFUSED` handles this automatically — the portfile is deleted and a new daemon is spawned. No manual cleanup needed.

**[Risk] Race condition: two CLI calls start two daemons simultaneously** → Mitigation: both daemons try to write the same portfile. The second one's `listen` succeeds (different port), but its portfile write overwrites the first. One daemon becomes orphaned. It will self-exit on idle timeout since it receives no requests. This is rare (requires two calls within the ~100ms spawn-to-listen window) and self-healing.

**[Risk] PyrightClient startup time (~1–2s) in single-call mode** → Mitigation: correctness fix — Python applies currently do nothing because `setPythonContext` is never called.

**[Risk] `refreshFromFileSystem` doesn't cover new files created by multi-file refactorings** → Mitigation: server checks for new files in `result.filesChanged` and calls `project.addSourceFileAtPath()`.

## Migration Plan

All changes are additive:
1. `src/core/server/daemon.ts` — TCP server, JSON-RPC dispatcher, idle timer, portfile management
2. `src/core/server/portfile.ts` — read/write/delete the `.refactoring-server` file
3. `src/core/server/connect.ts` — "start or connect" algorithm, shared by `apply.ts` and `RefactorClient`
4. `src/core/refactor-client.ts` — programmatic client for batch callers
5. `src/core/cli/commands/serve.ts` — `refactor serve` CLI subcommand (starts daemon in foreground)
6. `src/core/cli/program.ts` — registers `serve` subcommand (one line)
7. `src/core/cli/commands/apply.ts` — uses "start or connect" for TypeScript applies; adds Python context setup/teardown for `lang === "python"`
8. `scripts/test-real-codebase/run.ts` — uses `RefactorClient` instead of per-candidate subprocess
9. `.gitignore` — add `.refactoring-server`

No existing behaviour changes for TypeScript single-call mode (daemon is spawned transparently). Python single-call mode changes from "silently broken" to "working". No new runtime dependencies (TCP, JSON-RPC, Content-Length framing are all stdlib/hand-rolled).
