## Why

The daemon server keeps a ts-morph `Project` (and optionally a PyrightClient) loaded in memory for fast responses. But when files change externally — IDE edits, git operations, other tools — the in-memory model goes stale. The server currently only refreshes after its own `apply` calls. A stale AST leads to wrong refactoring results, failed preconditions on valid code, or silent corruption. File watching closes this gap so the server can stay long-lived without sacrificing correctness.

## What Changes

- Add a filesystem watcher to the daemon that monitors all in-scope source files (TypeScript and Python)
- On detected changes: refresh the ts-morph AST for affected TypeScript files, and notify PyrightClient via `didChange`/`didSave` for affected Python files
- On file creation: add new files to the ts-morph project and notify PyrightClient of new files
- On file deletion: remove deleted files from the ts-morph project and notify PyrightClient
- Debounce rapid changes (e.g., git checkout touching many files) to avoid redundant refresh storms
- Expose a `status` JSON-RPC method so clients can check whether the model is up-to-date or a refresh is in-flight

## Capabilities

### New Capabilities
- `file-watcher`: Filesystem watching, debouncing, and model refresh coordination for the daemon server

### Modified Capabilities
- `cli-server-mode`: The daemon now starts a file watcher at startup and tears it down on shutdown. The `DaemonState` gains watcher state. The existing `refresh` RPC method becomes a force-refresh (bypassing debounce).

## Impact

- **Code**: `src/core/server/daemon.ts` gains watcher setup/teardown. New module for watcher logic.
- **Dependencies**: Uses Node.js `fs.watch` (recursive) — no new npm dependencies.
- **Python**: PyrightClient already handles `didOpen`/`didChange` LSP notifications; we send those on external changes.
- **Performance**: Debouncing prevents refresh storms. Watcher overhead is negligible on modern OS (inotify/FSEvents/ReadDirectoryChangesW).
- **Testing**: Needs integration tests that modify files externally and verify the daemon sees fresh state.
