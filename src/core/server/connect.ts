import { connect as tcpConnect, type Socket } from "net";
import { spawn } from "child_process";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { FramingParser, frameMessage } from "./framing.js";
import * as portfile from "./portfile.js";

const POLL_INTERVAL_MS = 100;
const SPAWN_TIMEOUT_MS = 10_000;
const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI_ENTRYPOINT = join(__dirname, "..", "cli", "index.ts");

export interface DaemonConnection {
  socket: Socket;
  parser: FramingParser;
  token: string;
}

function tryConnect(port: number): Promise<Socket | null> {
  return new Promise((resolve) => {
    const socket = tcpConnect(port, "127.0.0.1", () => {
      resolve(socket);
    });
    socket.once("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "ECONNREFUSED") {
        resolve(null);
      } else {
        resolve(null);
      }
    });
  });
}

function sendInitialize(socket: Socket, parser: FramingParser, token: string): Promise<boolean> {
  return new Promise((resolve) => {
    const body = JSON.stringify({
      jsonrpc: "2.0",
      id: 0,
      method: "initialize",
      params: { token },
    });
    socket.write(frameMessage(body));

    const handler = (data: Buffer): void => {
      const messages = parser.feed(data.toString("utf-8"));
      for (const msg of messages) {
        socket.removeListener("data", handler);
        const parsed = JSON.parse(msg) as Record<string, unknown>;
        resolve(!("error" in parsed));
        return;
      }
    };
    socket.on("data", handler);
  });
}

function spawnDaemon(projectRoot: string): void {
  // In compiled (bun) mode, process.argv[1] is undefined or the binary itself.
  // In dev (tsx/node) mode, we need the entrypoint file.
  // Resolve CLI entrypoint relative to this module's location as a reliable fallback.
  const entrypoint = process.argv[1]?.endsWith("index.ts") ? process.argv[1] : CLI_ENTRYPOINT;

  const child = spawn(
    process.execPath,
    [...process.execArgv, entrypoint, "serve", "--path", projectRoot],
    {
      detached: true,
      stdio: ["ignore", "ignore", "ignore"],
    },
  );
  child.unref();
}

function waitForPortfile(
  projectRoot: string,
  timeoutMs: number,
): Promise<portfile.PortfileData | null> {
  return new Promise((resolve) => {
    const start = Date.now();
    const poll = (): void => {
      const data = portfile.read(projectRoot);
      if (data) {
        resolve(data);
        return;
      }
      if (Date.now() - start > timeoutMs) {
        resolve(null);
        return;
      }
      setTimeout(poll, POLL_INTERVAL_MS);
    };
    poll();
  });
}

export async function connectOrSpawn(projectRoot: string): Promise<DaemonConnection | null> {
  // Step 1: check existing portfile
  const existing = portfile.read(projectRoot);
  if (existing) {
    const socket = await tryConnect(existing.port);
    if (socket) {
      const parser = new FramingParser();
      const ok = await sendInitialize(socket, parser, existing.token);
      if (ok) {
        return { socket, parser, token: existing.token };
      }
      socket.end();
    }
    // Stale portfile — clean up
    portfile.unlink(projectRoot);
  }

  // Step 2: spawn daemon
  spawnDaemon(projectRoot);

  // Step 3: wait for portfile to appear
  const data = await waitForPortfile(projectRoot, SPAWN_TIMEOUT_MS);
  if (!data) return null;

  // Step 4: connect to the new daemon
  const socket = await tryConnect(data.port);
  if (!socket) return null;

  const parser = new FramingParser();
  const ok = await sendInitialize(socket, parser, data.token);
  if (!ok) {
    socket.end();
    return null;
  }

  return { socket, parser, token: data.token };
}
