## Context

The daemon server (`src/core/server/daemon.ts`) loads a ts-morph `Project` and optionally a `PyrightClient` at startup, then serves refactoring requests over JSON-RPC. It refreshes the in-memory AST after its own `apply` calls (`handleApply`, lines 117-127) and supports a manual `refresh` RPC method. But external file changes (IDE saves, git operations, build tools) are invisible to the daemon — the model drifts from disk.

The ts-morph `Project` is the single source of truth for TypeScript refactorings. For Python, `PyrightClient` manages its own workspace model via LSP, but currently receives no `didChange`/`didSave` notifications for external edits.

## Goals / Non-Goals

**Goals:**
- Automatically detect filesystem changes to in-scope source files and refresh the daemon's internal models
- Handle file creation, modification, and deletion for both TypeScript and Python files
- Debounce rapid changes to avoid refresh storms during git operations
- Keep the daemon's model consistent enough that the next `apply` always operates on fresh state

**Non-Goals:**
- Real-time streaming of file changes to connected clients (no push notifications)
- Watching non-source files (configs, node_modules, etc.)
- Replacing Pyright's own internal file watching (we just notify it of changes it can't see because it's running in stdio mode)
- Sub-millisecond freshness guarantees — debounce window means brief staleness is acceptable

## Decisions

### 1. Use Node.js `fs.watch` with recursive option

**Choice:** `fs.watch(projectRoot, { recursive: true })` filtered to in-scope files.

**Alternatives considered:**
- `chokidar`: Mature, battle-tested, but adds a dependency for something the stdlib now handles. Node 20+ `fs.watch` with `recursive: true` works on Linux (inotify), macOS (FSEvents), and Windows (ReadDirectoryChangesW).
- `fs.watchFile` (polling): Reliable but CPU-expensive for large projects. Not suitable for watching hundreds of source files.

**Rationale:** Zero dependencies. The recursive option covers subdirectories. We filter events against the project's source file list to ignore irrelevant changes.

### 2. Debounce with a coalescing window

**Choice:** Collect changed paths in a `Set` and flush after 100ms of quiet time (no new events). On flush, refresh all accumulated paths in one batch.

**Rationale:** Git checkout can trigger hundreds of change events in milliseconds. Without debouncing, we'd call `refreshFromFileSystem()` for the same file multiple times. A 100ms window is short enough that interactive users won't notice staleness, but long enough to coalesce bulk operations.

### 3. Separate refresh logic for TypeScript and Python

**TypeScript (.ts/.tsx/.js/.jsx):**
- Modified files: `sourceFile.refreshFromFileSystem()`
- New files matching tsconfig scope: `project.addSourceFileAtPath(path)`
- Deleted files: `project.removeSourceFile(sourceFile)`

**Python (.py):**
- Send LSP `textDocument/didSave` notification to PyrightClient (requires making `sendNotification` accessible)
- For new/deleted files, Pyright's workspace indexing handles discovery on its own once notified

**Rationale:** ts-morph requires explicit refresh calls. Pyright uses LSP document sync — sending `didSave` is sufficient for it to re-analyze.

### 4. Watcher lifecycle tied to daemon

The watcher starts after the server is listening and the portfile is written. It is closed when the server closes (shutdown, SIGTERM, idle timeout). This avoids watching before the project is loaded or after the daemon is torn down.

### 5. Expose `sendNotification` on PyrightClient

Currently `sendNotification` is private. Rather than exposing the generic method, add a specific `notifyFileSaved(uri: string)` public method that sends the proper LSP `textDocument/didSave` notification. This keeps the API surface narrow.

## Risks / Trade-offs

- **[`fs.watch` reliability]** → `fs.watch` can emit duplicate events or miss rapid renames on some platforms. Mitigation: debouncing absorbs duplicates; the existing manual `refresh` RPC serves as a fallback.
- **[Refresh during apply]** → An external change arriving mid-apply could cause inconsistency. Mitigation: the daemon processes requests serially (single-threaded event loop), so the debounce flush is a microtask that only runs between requests.
- **[Large project overhead]** → Watching a monorepo with thousands of files could generate noise. Mitigation: filter events against the source file list before any refresh work. Files outside tsconfig scope are ignored.
- **[Python didSave without prior didOpen]** → Some LSP servers require `didOpen` before `didSave`. Mitigation: test with Pyright specifically; if needed, send `didOpen` with file contents first.
