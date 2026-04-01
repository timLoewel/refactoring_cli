import { createServer, type Server, type Socket } from "net";
import { randomBytes } from "crypto";
import { FramingParser, frameMessage } from "./framing.js";
import * as portfile from "./portfile.js";
import { loadProject } from "../project-model.js";
import { applyRefactoring } from "../apply.js";
import { registry } from "../refactoring-registry.js";
import { FileWatcher } from "./file-watcher.js";
import "../../refactorings/register-all.js"; // side-effect: populates registry
import type { Project } from "ts-morph";
import type { PyrightClient } from "../../python/pyright-client.js";
import type { ApplyResult } from "../refactoring.types.js";

const IDLE_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes

interface DaemonState {
  project: Project;
  projectRoot: string;
  token: string;
  server: Server;
  watcher: FileWatcher | null;
  pyrightClient: PyrightClient | null;
}

interface JsonRpcRequest {
  jsonrpc: string;
  id: number;
  method: string;
  params: Record<string, unknown>;
}

let idleTimer: NodeJS.Timeout;

function resetIdleTimer(server: Server): void {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    server.close();
  }, IDLE_TIMEOUT_MS);
}

function jsonRpcResult(id: number, result: unknown): string {
  return JSON.stringify({ jsonrpc: "2.0", id, result });
}

function jsonRpcError(id: number, code: number, message: string): string {
  return JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } });
}

function parseRequest(raw: string): JsonRpcRequest | { error: string; id: number | null } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { error: "Parse error", id: null };
  }

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("jsonrpc" in parsed) ||
    !("id" in parsed) ||
    !("method" in parsed)
  ) {
    return { error: "Invalid request", id: null };
  }

  const obj = parsed as Record<string, unknown>;
  if (obj["jsonrpc"] !== "2.0") {
    return {
      error: "Invalid jsonrpc version",
      id: typeof obj["id"] === "number" ? obj["id"] : null,
    };
  }

  return {
    jsonrpc: "2.0",
    id: obj["id"] as number,
    method: obj["method"] as string,
    params: (typeof obj["params"] === "object" && obj["params"] !== null
      ? obj["params"]
      : {}) as Record<string, unknown>,
  };
}

function handleApply(
  state: DaemonState,
  params: Record<string, unknown>,
): ApplyResult | { error: { code: number; message: string } } {
  const name = params["name"];
  if (typeof name !== "string") {
    return { error: { code: -32602, message: "Missing required param: name" } };
  }

  const definition = registry.lookup(name);
  if (!definition) {
    return { error: { code: -32602, message: `Unknown refactoring: ${name}` } };
  }

  const refactoringParams = (
    typeof params["params"] === "object" && params["params"] !== null ? params["params"] : {}
  ) as Record<string, unknown>;

  const file = refactoringParams["file"];
  if (typeof file === "string") {
    const sf = state.project.getSourceFile(file);
    if (!sf) {
      return { error: { code: -32602, message: `File not in project: ${file}` } };
    }
  }

  const dryRun = params["dryRun"] === true;

  let result: ApplyResult;
  try {
    result = applyRefactoring(definition, state.project, refactoringParams, { dryRun });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { error: { code: -32603, message: `Apply failed: ${msg}` } };
  }

  if (result.success && !dryRun) {
    for (const filePath of result.filesChanged) {
      const sf = state.project.getSourceFile(filePath);
      if (sf) {
        sf.refreshFromFileSystem();
      } else {
        state.project.addSourceFileAtPath(filePath);
      }
    }
    if (state.watcher) {
      state.watcher.skipPaths(result.filesChanged);
    }
  }

  return result;
}

/**
 * Handle a single JSON-RPC message on a connection.
 * Returns true if the connection should stay open, false to close it.
 */
function handleMessage(
  state: DaemonState,
  socket: Socket,
  message: string,
  initialized: boolean,
): boolean {
  const req = parseRequest(message);

  if ("error" in req) {
    const id = req.id ?? 0;
    socket.write(frameMessage(jsonRpcError(id, -32700, req.error)));
    return false;
  }

  resetIdleTimer(state.server);

  if (req.method === "initialize") {
    const token = req.params["token"];
    if (token !== state.token) {
      socket.write(frameMessage(jsonRpcError(req.id, -32600, "Invalid token")));
      return false;
    }
    socket.write(frameMessage(jsonRpcResult(req.id, { rootUri: state.projectRoot })));
    return true;
  }

  if (!initialized) {
    socket.write(frameMessage(jsonRpcError(req.id, -32600, "Connection not initialized")));
    return false;
  }

  if (req.method === "apply") {
    const result = handleApply(state, req.params);
    if ("error" in result) {
      socket.write(frameMessage(jsonRpcError(req.id, result.error.code, result.error.message)));
    } else {
      socket.write(frameMessage(jsonRpcResult(req.id, result)));
    }
    return true;
  }

  if (req.method === "refresh") {
    const files = req.params["files"];
    if (Array.isArray(files)) {
      for (const filePath of files) {
        if (typeof filePath === "string") {
          const sf = state.project.getSourceFile(filePath);
          if (sf) {
            sf.refreshFromFileSystem();
          }
        }
      }
    }
    socket.write(frameMessage(jsonRpcResult(req.id, null)));
    return true;
  }

  if (req.method === "status") {
    const w = state.watcher;
    socket.write(
      frameMessage(
        jsonRpcResult(req.id, {
          watching: w?.watching ?? false,
          pendingRefresh: w?.pendingRefresh ?? false,
          pendingFiles: w?.pendingFiles ?? 0,
        }),
      ),
    );
    return true;
  }

  if (req.method === "shutdown") {
    socket.write(frameMessage(jsonRpcResult(req.id, null)));
    state.server.close();
    return false;
  }

  socket.write(frameMessage(jsonRpcError(req.id, -32601, `Unknown method: ${req.method}`)));
  return true;
}

async function setupPythonIfAvailable(projectRoot: string): Promise<PyrightClient | null> {
  try {
    const { PyrightClient: PC } = await import("../../python/pyright-client.js");
    const { createPythonParser } = await import("../../python/tree-sitter-parser.js");
    const { setPythonContext } = await import("../../python/python-refactoring-builder.js");

    const pyright = new PC(projectRoot);
    await pyright.ensureReady();
    const parser = createPythonParser();
    setPythonContext({ pyright, parser, projectRoot });
    return pyright;
  } catch {
    // Python dependencies not available — Python refactorings will fail with a clear error
    return null;
  }
}

export function startDaemon(projectRoot: string): Promise<void> {
  return new Promise((resolve, reject) => {
    let model;
    try {
      model = loadProject({ path: projectRoot });
    } catch (err: unknown) {
      reject(err);
      return;
    }

    const token = randomBytes(16).toString("hex");
    const server = createServer();

    const state: DaemonState = {
      project: model.project,
      projectRoot: model.projectRoot,
      token,
      server,
      watcher: null,
      pyrightClient: null,
    };

    // Set up Python context (non-blocking, optional)
    setupPythonIfAvailable(model.projectRoot)
      .then((client) => {
        state.pyrightClient = client;
        if (state.watcher && client) {
          state.watcher.pyrightClient = client;
        }
      })
      .catch((err: unknown) => {
        process.stderr.write(
          `Python setup failed: ${err instanceof Error ? err.message : String(err)}\n`,
        );
      });

    server.on("connection", (socket: Socket) => {
      const parser = new FramingParser();
      let initialized = false;

      socket.on("data", (data: Buffer) => {
        const messages = parser.feed(data.toString("utf-8"));
        for (const message of messages) {
          const keepOpen = handleMessage(state, socket, message, initialized);
          if (!keepOpen) {
            socket.end();
            return;
          }
          // If we just handled an initialize successfully, mark this connection
          if (!initialized) {
            const parsed = parseRequest(message);
            if (!("error" in parsed) && parsed.method === "initialize") {
              initialized = true;
            }
          }
        }
      });

      socket.on("error", () => {
        parser.reset();
      });
    });

    server.on("error", (err: Error) => {
      reject(err);
    });

    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (!addr || typeof addr === "string") {
        server.close();
        reject(new Error("Failed to get server address"));
        return;
      }

      portfile.write(state.projectRoot, addr.port, token);
      resetIdleTimer(server);

      // Start file watcher
      try {
        state.watcher = new FileWatcher({
          project: state.project,
          projectRoot: state.projectRoot,
          sourceFiles: model.sourceFiles,
          pyrightClient: state.pyrightClient,
        });
        state.watcher.start();
      } catch (err: unknown) {
        process.stderr.write(
          `File watcher failed to start: ${err instanceof Error ? err.message : String(err)}\n`,
        );
      }

      process.on("exit", () => portfile.unlink(state.projectRoot));
      process.on("SIGTERM", () => server.close());
      process.on("SIGINT", () => server.close());

      server.on("close", () => {
        clearTimeout(idleTimer);
        if (state.watcher) {
          state.watcher.close();
        }
        portfile.unlink(state.projectRoot);
      });

      resolve();
    });
  });
}
