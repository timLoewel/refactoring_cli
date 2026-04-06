## 1. File Watcher Module

- [x] 1.1 Create `src/core/server/file-watcher.ts` with a `FileWatcher` class that wraps `fs.watch(projectRoot, { recursive: true })` and exposes `start()` / `close()` methods
- [x] 1.2 Implement event filtering: only process `.ts`, `.tsx`, `.js`, `.jsx`, `.py` files that are within tsconfig scope and not excluded by `.refactorignore` or default excludes
- [x] 1.3 Implement debounce logic: accumulate changed paths in a `Set`, flush after 100ms of quiet time, distinguish create/modify/delete events
- [x] 1.4 Add a `skipPaths(paths: string[])` method that removes paths from the pending debounce set (used by post-apply to prevent double-refresh)

## 2. TypeScript Model Refresh

- [x] 2.1 On debounce flush, refresh modified TypeScript files via `sourceFile.refreshFromFileSystem()`
- [x] 2.2 On debounce flush, add newly created TypeScript files via `project.addSourceFileAtPath()` if they match tsconfig scope
- [x] 2.3 On debounce flush, remove deleted TypeScript files via `project.removeSourceFile()`

## 3. Python Notification

- [x] 3.1 Add `notifyFileSaved(uri: string)` public method to `PyrightClient` that sends `textDocument/didSave` LSP notification
- [x] 3.2 On debounce flush, call `notifyFileSaved` for each modified `.py` file (skip if PyrightClient is not initialized)

## 4. Daemon Integration

- [x] 4.1 Wire `FileWatcher` into `startDaemon`: create after server is listening, pass project + PyrightClient reference, start watching
- [x] 4.2 Close the watcher on server `close` event (shutdown, idle timeout, signals)
- [x] 4.3 Handle watcher errors: log to stderr, continue operating without watcher
- [x] 4.4 After `handleApply` refreshes changed files, call `watcher.skipPaths(result.filesChanged)` to prevent double-refresh
- [x] 4.5 Store watcher reference and PyrightClient in `DaemonState`

## 5. Status RPC Method

- [x] 5.1 Add `status` method handler in `handleMessage` that returns `{ watching, pendingRefresh, pendingFiles }` from the watcher state
- [x] 5.2 Handle the case where watcher is null (not started or failed)

## 6. Testing

- [x] 6.1 Unit test `FileWatcher` debounce logic: verify coalescing, quiet-time reset, and `skipPaths` behavior
- [x] 6.2 Unit test event filtering: verify only in-scope source files trigger refresh
- [x] 6.3 Integration test: start daemon, modify a file externally, verify next apply sees the change
- [x] 6.4 Integration test: start daemon, create a new file, verify it becomes available for refactoring
- [x] 6.5 Integration test: start daemon, delete a file, verify it is removed from the project model
- [x] 6.6 Test `status` RPC method returns correct state before and after external changes
