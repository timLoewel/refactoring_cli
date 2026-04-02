import { connect, type Socket } from "net";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { FramingParser, frameMessage } from "./framing.js";
import * as portfile from "./portfile.js";
import { startDaemon } from "./daemon.js";

// Minimal tsconfig + source file so loadProject works
function setupMiniProject(dir: string): void {
  writeFileSync(
    join(dir, "tsconfig.json"),
    JSON.stringify({ compilerOptions: { strict: true }, include: ["src/**/*.ts"] }),
  );
  mkdirSync(join(dir, "src"), { recursive: true });
  writeFileSync(join(dir, "src", "index.ts"), 'const greeting = "hello";\nexport { greeting };\n');
}

function connectAndInit(
  port: number,
  token: string,
): Promise<{
  socket: Socket;
  parser: FramingParser;
  sendRequest: (method: string, params: Record<string, unknown>) => number;
}> {
  return new Promise((resolve, reject) => {
    const socket = connect(port, "127.0.0.1", () => {
      const parser = new FramingParser();
      let nextId = 1;

      const sendRequest = (method: string, params: Record<string, unknown>): number => {
        const id = nextId++;
        const body = JSON.stringify({ jsonrpc: "2.0", id, method, params });
        socket.write(frameMessage(body));
        return id;
      };

      // Send initialize
      const initId = sendRequest("initialize", { token });

      // Wait for initialize response
      socket.once("data", (data: Buffer) => {
        const messages = parser.feed(data.toString("utf-8"));
        expect(messages.length).toBeGreaterThanOrEqual(1);
        const response = JSON.parse(messages[0]!) as { id: number; result: { rootUri: string } };
        expect(response.id).toBe(initId);
        expect(response.result.rootUri).toBeDefined();
        resolve({ socket, parser, sendRequest });
      });
    });
    socket.on("error", reject);
  });
}

function readResponse(socket: Socket, parser: FramingParser): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    const handler = (data: Buffer): void => {
      const messages = parser.feed(data.toString("utf-8"));
      if (messages.length > 0) {
        socket.removeListener("data", handler);
        resolve(JSON.parse(messages[0]!) as Record<string, unknown>);
      }
    };
    socket.on("data", handler);
  });
}

describe("daemon", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "daemon-test-"));
    setupMiniProject(tmpDir);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("starts, writes portfile, and accepts initialize", async () => {
    await startDaemon(tmpDir);

    const data = portfile.read(tmpDir);
    expect(data).not.toBeNull();

    const { socket } = await connectAndInit(
      (data as portfile.PortfileData).port,
      (data as portfile.PortfileData).token,
    );
    socket.end();
  }, 15000);

  it("rejects invalid token", async () => {
    await startDaemon(tmpDir);
    const data = portfile.read(tmpDir) as portfile.PortfileData;

    const response = await new Promise<Record<string, unknown>>((resolve, reject) => {
      const socket = connect(data.port, "127.0.0.1", () => {
        const parser = new FramingParser();
        const body = JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: { token: "wrong" },
        });
        socket.write(frameMessage(body));
        socket.on("data", (chunk: Buffer) => {
          const msgs = parser.feed(chunk.toString("utf-8"));
          if (msgs.length > 0) resolve(JSON.parse(msgs[0]!) as Record<string, unknown>);
        });
      });
      socket.on("error", reject);
    });

    expect(response["error"]).toBeDefined();
    const err = response["error"] as { code: number };
    expect(err.code).toBe(-32600);
  }, 15000);

  it("dispatches apply and returns result", async () => {
    await startDaemon(tmpDir);
    const data = portfile.read(tmpDir) as portfile.PortfileData;
    const { socket, parser, sendRequest } = await connectAndInit(data.port, data.token);

    // rename-variable is available in the registry — try an apply
    sendRequest("apply", {
      name: "rename-variable",
      params: { file: join(tmpDir, "src", "index.ts"), target: "greeting", name: "salutation" },
    });

    const response = await readResponse(socket, parser);
    expect(response["error"]).toBeUndefined();
    expect(response["result"]).toBeDefined();
    const result = response["result"] as { success: boolean; filesChanged: string[] };
    expect(result.success).toBe(true);
    expect(result.filesChanged.length).toBeGreaterThan(0);

    socket.end();
  }, 15000);

  it("returns error for file outside project", async () => {
    await startDaemon(tmpDir);
    const data = portfile.read(tmpDir) as portfile.PortfileData;
    const { socket, parser, sendRequest } = await connectAndInit(data.port, data.token);

    sendRequest("apply", {
      name: "rename-variable",
      params: { file: "/nonexistent/foo.ts", target: "x", newName: "y" },
    });

    const response = await readResponse(socket, parser);
    expect(response["error"]).toBeDefined();
    const err = response["error"] as { code: number };
    expect(err.code).toBe(-32602);

    socket.end();
  }, 15000);

  it("shuts down cleanly and removes portfile", async () => {
    await startDaemon(tmpDir);
    const data = portfile.read(tmpDir) as portfile.PortfileData;
    const { socket, parser, sendRequest } = await connectAndInit(data.port, data.token);

    sendRequest("shutdown", {});
    const response = await readResponse(socket, parser);
    expect(response["result"]).toBeNull();

    // Wait a tick for cleanup
    await new Promise((r) => setTimeout(r, 100));
    expect(portfile.read(tmpDir)).toBeNull();

    socket.end();
  }, 15000);
});
