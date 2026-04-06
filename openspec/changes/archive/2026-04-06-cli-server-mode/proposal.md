## Why

Two related problems share the same root cause — reloading a language analysis context on every CLI call:

1. **TypeScript**: each `refactor apply` spawns a fresh process that reloads the full ts-morph project (~40s on TypeORM). Batch workflows (test runner, agent loops) are impractical.
2. **Python**: `PyrightClient` exists as finished infrastructure (LSP client over stdin/stdout) but is never wired into the CLI. Python refactorings currently spawn a subprocess per call instead of reusing a live Pyright server. `setPythonContext` is never called in production.

A persistent server mode loads the project once and serves many apply requests over its lifetime.

## What Changes

- New `refactor serve` command: starts a long-lived JSON-RPC server on stdin/stdout, loads the ts-morph project once at startup (via `--path` / `--config`), and dispatches `apply` requests without reloading.
- New `RefactorClient` class (modelled on `PyrightClient`): wraps the server child process. The caller constructs `new RefactorClient(projectRoot)`, which spawns the server and holds the pipe. Multiple independent instances can coexist — routing is trivially "use the instance whose root matches". No daemon, no socket registry.
- **Python repair**: wire `PyrightClient` into the CLI apply path. When `apply` is called for a Python refactoring, a `PyrightClient` is constructed for the project root (or reused if already alive in server mode), set as the active Python context via `setPythonContext`, and shut down after the request completes in single-call mode.
- The real-codebase test runner is updated to use `RefactorClient` for TypeScript candidates, replacing the one-process-per-candidate loop.
- No changes to the existing `refactor apply` CLI contract — `serve` is purely additive.

## Capabilities

### New Capabilities

- `cli-server-mode`: The `refactor serve` command and `RefactorClient` class. Defines the JSON-RPC wire protocol (method: `apply`, result/error shapes), server lifecycle (startup / graceful shutdown), and the structured error for files outside the loaded project.

### Modified Capabilities

- `cli-framework`: New `serve` subcommand registered on the CLI program.
- `python-refactoring-support`: `PyrightClient` wired into the apply path; `setPythonContext` called with a live client before each Python apply and cleaned up after. Applies to both single-call and server mode.

## Impact

- New files: `src/core/cli/commands/serve.ts`, `src/core/refactor-client.ts`
- `src/core/cli/program.ts`: registers `serve`
- `src/core/cli/commands/apply.ts`: constructs and tears down `PyrightClient` for Python refactorings in single-call mode
- `scripts/test-real-codebase/run.ts`: uses `RefactorClient` instead of per-candidate subprocess
- No new runtime dependencies (JSON-RPC over stdio needs no library)
