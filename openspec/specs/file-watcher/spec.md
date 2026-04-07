# file-watcher Specification

## Purpose
Watch project source files for external changes and refresh the TypeScript model so the daemon always operates on current AST state.

## Requirements

### Requirement: Watch project source files for external changes
The daemon SHALL watch the project root directory recursively using `fs.watch` and detect create, modify, and delete events for in-scope source files.

#### Scenario: TypeScript file modified externally
- **WHEN** an in-scope `.ts` or `.tsx` file is modified outside the daemon (e.g., by an IDE)
- **THEN** the watcher SHALL detect the change and schedule a refresh for that file

#### Scenario: New file created in project scope
- **WHEN** a new `.ts` or `.tsx` file is created within the tsconfig/project scope
- **THEN** the watcher SHALL detect the creation and schedule it for addition to the project model

#### Scenario: File deleted from project
- **WHEN** an in-scope source file is deleted from the filesystem
- **THEN** the watcher SHALL detect the deletion and schedule removal from the project model

#### Scenario: Changes outside project scope ignored
- **WHEN** a file changes in `node_modules/`, `dist/`, `build/`, or outside the tsconfig include patterns
- **THEN** the watcher SHALL NOT trigger any refresh

#### Scenario: Non-source file changes ignored
- **WHEN** a non-source file changes (e.g., `.json`, `.md`, `.lock`)
- **THEN** the watcher SHALL NOT trigger any refresh

### Requirement: Debounce rapid filesystem events
The watcher SHALL coalesce rapid filesystem events using a debounce window to avoid redundant refresh operations during bulk changes.

#### Scenario: Git checkout triggers bulk changes
- **WHEN** a `git checkout` modifies 50 files within 10ms
- **THEN** the watcher SHALL coalesce all 50 changes into a single batch refresh after the debounce window (100ms of quiet time)

#### Scenario: Single file save
- **WHEN** a single file is saved in an IDE
- **THEN** the watcher SHALL refresh that file after the debounce window elapses (at most 100ms delay)

#### Scenario: Continuous rapid changes extend debounce
- **WHEN** file changes arrive continuously for 500ms
- **THEN** the watcher SHALL wait until 100ms after the last change before flushing the batch

### Requirement: Refresh TypeScript model on detected changes
When the debounce window flushes, the watcher SHALL update the ts-morph `Project` for all accumulated TypeScript file changes.

#### Scenario: Modified TypeScript file refreshed
- **WHEN** a batch flush includes a modified `.ts` file that is already in the ts-morph project
- **THEN** the watcher SHALL call `sourceFile.refreshFromFileSystem()` for that file

#### Scenario: New TypeScript file added to project
- **WHEN** a batch flush includes a newly created `.ts` file within tsconfig scope
- **THEN** the watcher SHALL call `project.addSourceFileAtPath()` for that file

#### Scenario: Deleted TypeScript file removed from project
- **WHEN** a batch flush includes a deleted `.ts` file that was in the ts-morph project
- **THEN** the watcher SHALL call `project.removeSourceFile()` for that file

#### Scenario: Subsequent apply sees refreshed state
- **WHEN** a file is modified externally and the debounce window has flushed
- **THEN** the next `apply` request SHALL operate on the updated AST

### Requirement: Watcher lifecycle tied to daemon
The watcher SHALL start after the daemon server is listening and stop when the daemon shuts down.

#### Scenario: Watcher starts with daemon
- **WHEN** the daemon server binds to a port and writes the portfile
- **THEN** the file watcher SHALL be started for the project root

#### Scenario: Watcher stops on shutdown
- **WHEN** the daemon receives a `shutdown` request or exits due to idle timeout, SIGTERM, or SIGINT
- **THEN** the file watcher SHALL be closed before the process exits

#### Scenario: Watcher error does not crash daemon
- **WHEN** the file watcher encounters an error (e.g., too many open files)
- **THEN** the daemon SHALL log the error to stderr and continue operating without the watcher
