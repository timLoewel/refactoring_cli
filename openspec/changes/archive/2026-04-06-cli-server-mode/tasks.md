## 1. Portfile module

- [x] 1.1 Create `src/core/server/portfile.ts` with `write(projectRoot, port, token)`, `read(projectRoot)`, and `unlink(projectRoot)` functions. Portfile path is `<projectRoot>/.refactoring-server`, content is `<port> <token>`
- [x] 1.2 Add `.refactoring-server` to `.gitignore`

## 2. JSON-RPC framing (extract from PyrightClient)

- [x] 2.1 Extract the Content-Length framing parser from `PyrightClient.handleData`/`tryParse` into a shared `src/core/server/framing.ts` module with `parseFramedMessages(buffer)` and `frameMessage(body)` functions
- [x] 2.2 Refactor `PyrightClient` to use the shared framing module instead of its inline implementation

## 3. Daemon server

- [x] 3.1 Create `src/core/server/daemon.ts`: TCP server (`net.createServer`) that listens on random port `127.0.0.1`, generates random hex token, writes portfile, accepts connections
- [x] 3.2 Implement connection handler: validate `initialize` (check token, return rootUri), dispatch `apply` requests, handle `shutdown`
- [x] 3.3 On `initialize`, load ts-morph `Project` from the project root's tsconfig, construct `PyrightClient` + tree-sitter `Parser`, call `setPythonContext`
- [x] 3.4 On `apply`, look up refactoring in registry, call `applyRefactoring(def, project, params, options)`, return the result as JSON-RPC response
- [x] 3.5 After each successful non-dry-run apply, refresh changed files via `project.getSourceFile(path)?.refreshFromFileSystem()` and handle new files via `project.addSourceFileAtPath(path)`
- [x] 3.6 Implement 15-minute idle timer: reset on each completed request, `server.close()` on expiry
- [x] 3.7 Delete portfile on `process.on('exit')`, handle `SIGTERM` and `SIGINT`
- [x] 3.8 On `apply` for file outside project, return JSON-RPC error code `-32602`

## 4. Connect module (start-or-connect algorithm)

- [x] 4.1 Create `src/core/server/connect.ts` with `connectOrSpawn(projectRoot): Promise<Socket>` that implements: read portfile → connect TCP → if ECONNREFUSED delete portfile and spawn → poll portfile (100ms, max 10s) → connect → send initialize(token)
- [x] 4.2 Implement `spawnDaemon(projectRoot)`: re-execute self via `process.execPath` + `process.argv[1]` with `['serve', '--path', projectRoot]`, detached, stdio ignored, `child.unref()`
- [x] 4.3 Add fallback: if portfile doesn't appear within 10s, return `null` (caller does in-process apply)

## 5. Serve CLI command

- [x] 5.1 Create `src/core/cli/commands/serve.ts` with `createServeCommand()`: accepts `--path <dir>`, starts daemon in foreground (calls daemon module directly, does not detach)
- [x] 5.2 Register `serve` subcommand in `src/core/cli/program.ts`

## 6. Wire apply.ts to use daemon

- [x] 6.1 In `apply.ts`, before dispatching a TypeScript refactoring: call `connectOrSpawn(projectRoot)`. If connection obtained, send `apply` request over TCP, print result, return. If `null` (fallback), continue with existing in-process apply
- [x] 6.2 In `apply.ts`, for Python refactorings in fallback (no daemon) mode: construct `PyrightClient(projectRoot)`, await `ensureReady()`, create `Parser` via `createPythonParser()`, call `setPythonContext({ pyright, parser, projectRoot })`, run apply, then `setPythonContext(null)` + `pyright.shutdown()`

## 7. RefactorClient class

- [x] 7.1 Create `src/core/refactor-client.ts`: class that runs `connectOrSpawn`, holds the TCP socket, exposes `async apply(name, params, options): Promise<ApplyResult>`
- [x] 7.2 Implement `close()` (disconnect without stopping daemon) and `shutdown()` (send shutdown method, daemon exits)

## 8. Test runner integration

- [x] 8.1 Update `scripts/test-real-codebase/run.ts` to create one `RefactorClient` before the candidate loop and call `client.apply()` instead of `runCLI(["apply", ...])`
- [x] 8.2 Call `client.close()` after all candidates are processed

## 9. Tests

- [x] 9.1 Unit test for portfile module: write/read/unlink cycle
- [x] 9.2 Unit test for framing module: parse single message, parse multiple buffered messages, handle incomplete message
- [x] 9.3 Integration test: start daemon via `createServeCommand`, connect, send initialize + apply + shutdown, verify result and portfile cleanup
- [x] 9.4 Integration test: stale portfile detection — write fake portfile with wrong port, verify connect deletes it and spawns fresh daemon
