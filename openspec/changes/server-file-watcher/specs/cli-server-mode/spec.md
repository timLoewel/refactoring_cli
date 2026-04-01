## MODIFIED Requirements

### Requirement: Post-apply source file refresh
After each successful (non-dry-run) apply, the server SHALL refresh the ts-morph project's in-memory AST for all files listed in `result.filesChanged`. The file watcher's debounce queue SHALL be cleared for these files to avoid redundant double-refresh.

#### Scenario: Changed file refreshed
- **WHEN** an apply modifies `src/foo.ts`
- **THEN** the server SHALL call `refreshFromFileSystem()` on that source file before processing the next request

#### Scenario: New file added to project
- **WHEN** an apply creates a new file not previously in the ts-morph project
- **THEN** the server SHALL call `project.addSourceFileAtPath()` for that file

#### Scenario: Subsequent apply sees updated AST
- **WHEN** a second apply targets a file modified by a previous apply in the same daemon session
- **THEN** the second apply SHALL operate on the updated AST, not the original

#### Scenario: No double-refresh from watcher
- **WHEN** an apply modifies files and the watcher detects those same changes
- **THEN** the watcher SHALL skip files already refreshed by the apply, avoiding redundant work

## ADDED Requirements

### Requirement: Status method reports model freshness
The `status` JSON-RPC method SHALL report whether the daemon's model is up-to-date or a refresh is pending.

#### Scenario: Model is fresh
- **WHEN** a client sends a `status` request and no file changes are pending
- **THEN** the server SHALL respond with `{ "watching": true, "pendingRefresh": false, "pendingFiles": 0 }`

#### Scenario: Refresh pending during debounce
- **WHEN** a client sends a `status` request while file changes are queued but the debounce window has not flushed
- **THEN** the server SHALL respond with `{ "watching": true, "pendingRefresh": true, "pendingFiles": <count> }`

#### Scenario: Watcher not running
- **WHEN** the watcher failed to start or is not supported
- **THEN** the server SHALL respond with `{ "watching": false, "pendingRefresh": false, "pendingFiles": 0 }`
