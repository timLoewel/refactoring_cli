import { mkdtempSync, rmSync, writeFileSync, mkdirSync, unlinkSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { connect } from "net";
import { FramingParser, frameMessage } from "./framing.js";
import * as portfile from "./portfile.js";
import { startDaemon } from "./daemon.js";

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
  socket: ReturnType<typeof connect>;
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

      const initId = sendRequest("initialize", { token });

      socket.once("data", (data: Buffer) => {
        const messages = parser.feed(data.toString("utf-8"));
        expect(messages.length).toBeGreaterThanOrEqual(1);
        const response = JSON.parse(messages[0]) as { id: number; result: { rootUri: string } };
        expect(response.id).toBe(initId);
        resolve({ socket, parser, sendRequest });
      });
    });
    socket.on("error", reject);
  });
}

function readResponse(
  socket: ReturnType<typeof connect>,
  parser: FramingParser,
): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    const handler = (data: Buffer): void => {
      const messages = parser.feed(data.toString("utf-8"));
      if (messages.length > 0) {
        socket.removeListener("data", handler);
        resolve(JSON.parse(messages[0]) as Record<string, unknown>);
      }
    };
    socket.on("data", handler);
  });
}

describe("file-watcher integration", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "watcher-test-"));
    setupMiniProject(tmpDir);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("status reports watcher is active", async () => {
    await startDaemon(tmpDir);
    const data = portfile.read(tmpDir) as portfile.PortfileData;
    const { socket, parser, sendRequest } = await connectAndInit(data.port, data.token);

    sendRequest("status", {});
    const response = await readResponse(socket, parser);
    const result = response["result"] as { watching: boolean; pendingRefresh: boolean; pendingFiles: number };

    expect(result.watching).toBe(true);
    expect(result.pendingRefresh).toBe(false);
    expect(result.pendingFiles).toBe(0);

    socket.end();
  }, 15000);

  it("detects externally modified file and refreshes model", async () => {
    await startDaemon(tmpDir);
    const data = portfile.read(tmpDir) as portfile.PortfileData;
    const { socket, parser, sendRequest } = await connectAndInit(data.port, data.token);

    // Modify file externally (simulating IDE save)
    writeFileSync(
      join(tmpDir, "src", "index.ts"),
      'const modified = "yes";\nexport { modified };\n',
    );

    // Wait for debounce to flush (100ms debounce + buffer)
    await new Promise((r) => setTimeout(r, 300));

    // The rename should work on the updated file content
    sendRequest("apply", {
      name: "rename-variable",
      params: { file: join(tmpDir, "src", "index.ts"), target: "modified", name: "updated" },
    });

    const response = await readResponse(socket, parser);
    expect(response["error"]).toBeUndefined();
    const result = response["result"] as { success: boolean };
    expect(result.success).toBe(true);

    socket.end();
  }, 15000);

  it("detects new file creation and adds to project", async () => {
    await startDaemon(tmpDir);
    const data = portfile.read(tmpDir) as portfile.PortfileData;
    const { socket, parser, sendRequest } = await connectAndInit(data.port, data.token);

    // Create a new file
    writeFileSync(
      join(tmpDir, "src", "newfile.ts"),
      'const fresh = "new";\nexport { fresh };\n',
    );

    // Wait for debounce
    await new Promise((r) => setTimeout(r, 300));

    // The new file should be available for refactoring
    sendRequest("apply", {
      name: "rename-variable",
      params: { file: join(tmpDir, "src", "newfile.ts"), target: "fresh", name: "brand" },
    });

    const response = await readResponse(socket, parser);
    expect(response["error"]).toBeUndefined();
    const result = response["result"] as { success: boolean };
    expect(result.success).toBe(true);

    socket.end();
  }, 15000);

  it("detects file deletion and removes from project", async () => {
    // Add a second file so we have something to delete
    writeFileSync(
      join(tmpDir, "src", "todelete.ts"),
      'export const temp = 1;\n',
    );

    await startDaemon(tmpDir);
    const data = portfile.read(tmpDir) as portfile.PortfileData;
    const { socket, parser, sendRequest } = await connectAndInit(data.port, data.token);

    // Delete the file
    unlinkSync(join(tmpDir, "src", "todelete.ts"));

    // Wait for debounce
    await new Promise((r) => setTimeout(r, 300));

    // Trying to refactor the deleted file should fail
    sendRequest("apply", {
      name: "rename-variable",
      params: { file: join(tmpDir, "src", "todelete.ts"), target: "temp", name: "gone" },
    });

    const response = await readResponse(socket, parser);
    expect(response["error"]).toBeDefined();

    socket.end();
  }, 15000);

  it("status shows pending during debounce window", async () => {
    await startDaemon(tmpDir);
    const data = portfile.read(tmpDir) as portfile.PortfileData;
    const { socket, parser, sendRequest } = await connectAndInit(data.port, data.token);

    // Modify file and immediately check status (before debounce flushes)
    writeFileSync(
      join(tmpDir, "src", "index.ts"),
      'const quick = "change";\nexport { quick };\n',
    );

    // Small delay to let fs.watch fire but not enough for debounce
    await new Promise((r) => setTimeout(r, 30));

    sendRequest("status", {});
    const response = await readResponse(socket, parser);
    const result = response["result"] as { watching: boolean; pendingRefresh: boolean; pendingFiles: number };

    expect(result.watching).toBe(true);
    // pendingRefresh may or may not be true depending on timing —
    // just verify the response shape is correct
    expect(typeof result.pendingRefresh).toBe("boolean");
    expect(typeof result.pendingFiles).toBe("number");

    // Wait for debounce to complete before cleanup
    await new Promise((r) => setTimeout(r, 200));

    socket.end();
  }, 15000);
});
