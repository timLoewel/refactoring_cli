import { spawn, type ChildProcess } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { EventEmitter } from "node:events";

// ---- JSON-RPC types ----

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: number;
  method: string;
  params?: unknown;
}

interface JsonRpcNotification {
  jsonrpc: "2.0";
  method: string;
  params?: unknown;
}

// ---- LSP types (subset) ----

interface Position {
  line: number;
  character: number;
}

interface Range {
  start: Position;
  end: Position;
}

interface Location {
  uri: string;
  range: Range;
}

interface TextDocumentIdentifier {
  uri: string;
}

interface TextDocumentPositionParams {
  textDocument: TextDocumentIdentifier;
  position: Position;
}

export interface TextEdit {
  range: Range;
  newText: string;
}

export interface WorkspaceEdit {
  changes?: Record<string, TextEdit[]>;
  documentChanges?: unknown[];
}

export interface HoverResult {
  contents: { kind: string; value: string } | string;
  range?: Range;
}

// ---- Client ----

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
}

function getLangServerPath(): string {
  const require = createRequire(import.meta.url);
  const pyrightPkg = path.dirname(require.resolve("pyright/package.json"));
  return path.join(pyrightPkg, "langserver.index.js");
}

export class PyrightClient {
  private process: ChildProcess | null = null;
  private nextId = 1;
  private pending = new Map<number, PendingRequest>();
  private buffer = "";
  private contentLength = -1;
  private initialized = false;
  private initializing: Promise<void> | null = null;
  private rootUri: string;
  private emitter = new EventEmitter();
  private shutdownRequested = false;

  constructor(projectRoot: string) {
    this.rootUri = `file://${projectRoot}`;
  }

  async ensureReady(): Promise<void> {
    if (this.initialized && this.process && !this.process.killed) {
      return;
    }
    if (this.initializing) {
      return this.initializing;
    }
    this.initializing = this.startAndInitialize();
    try {
      await this.initializing;
    } finally {
      this.initializing = null;
    }
  }

  private async startAndInitialize(): Promise<void> {
    this.cleanup();

    const langServerPath = getLangServerPath();
    this.process = spawn("node", [langServerPath, "--stdio"], {
      stdio: ["pipe", "pipe", "pipe"],
    });

    this.process.stdout?.on("data", (chunk: Buffer) => {
      this.handleData(chunk.toString());
    });

    this.process.on("exit", (code) => {
      if (!this.shutdownRequested) {
        this.initialized = false;
        // Reject all pending requests
        for (const [id, req] of this.pending) {
          req.reject(new Error(`pyright exited unexpectedly (code ${code})`));
          this.pending.delete(id);
        }
        this.emitter.emit("crash", code);
      }
    });

    await this.sendInitialize();
    this.sendNotification("initialized", {});
    this.initialized = true;
  }

  private async sendInitialize(): Promise<void> {
    await this.sendRequest("initialize", {
      processId: process.pid,
      rootUri: this.rootUri,
      capabilities: {
        textDocument: {
          hover: { contentFormat: ["markdown", "plaintext"] },
          references: {},
          definition: {},
          rename: { prepareSupport: true },
        },
        workspace: {
          workspaceFolders: true,
        },
      },
      workspaceFolders: [{ uri: this.rootUri, name: "root" }],
    });
  }

  async shutdown(): Promise<void> {
    if (!this.process || this.process.killed) {
      return;
    }
    this.shutdownRequested = true;
    try {
      await this.sendRequest("shutdown", null);
      this.sendNotification("exit", undefined);
    } catch {
      // Process may already be dead
    }
    this.cleanup();
  }

  private cleanup(): void {
    if (this.process && !this.process.killed) {
      this.process.kill();
    }
    this.process = null;
    this.initialized = false;
    this.buffer = "";
    this.contentLength = -1;
    this.pending.clear();
  }

  // ---- LSP request helpers ----

  async references(
    uri: string,
    position: Position,
    includeDeclaration = true,
  ): Promise<Location[]> {
    await this.ensureReady();
    const result = await this.sendRequest("textDocument/references", {
      textDocument: { uri },
      position,
      context: { includeDeclaration },
    });
    return (result as Location[] | null) ?? [];
  }

  async definition(uri: string, position: Position): Promise<Location | Location[]> {
    await this.ensureReady();
    const result = await this.sendRequest("textDocument/definition", {
      textDocument: { uri },
      position,
    } satisfies TextDocumentPositionParams);
    return (result as Location | Location[] | null) ?? [];
  }

  async hover(uri: string, position: Position): Promise<HoverResult | null> {
    await this.ensureReady();
    const result = await this.sendRequest("textDocument/hover", {
      textDocument: { uri },
      position,
    } satisfies TextDocumentPositionParams);
    return result as HoverResult | null;
  }

  async rename(uri: string, position: Position, newName: string): Promise<WorkspaceEdit | null> {
    await this.ensureReady();
    const result = await this.sendRequest("textDocument/rename", {
      textDocument: { uri },
      position,
      newName,
    });
    return result as WorkspaceEdit | null;
  }

  async prepareRename(uri: string, position: Position): Promise<Range | null> {
    await this.ensureReady();
    const result = await this.sendRequest("textDocument/prepareRename", {
      textDocument: { uri },
      position,
    } satisfies TextDocumentPositionParams);
    return result as Range | null;
  }

  onCrash(listener: (code: number | null) => void): void {
    this.emitter.on("crash", listener);
  }

  // ---- JSON-RPC transport ----

  private sendRequest(method: string, params: unknown): Promise<unknown> {
    const id = this.nextId++;
    const message: JsonRpcRequest = { jsonrpc: "2.0", id, method, params };
    const body = JSON.stringify(message);
    const header = `Content-Length: ${Buffer.byteLength(body)}\r\n\r\n`;

    return new Promise<unknown>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.process?.stdin?.write(header + body);
    });
  }

  private sendResponse(id: number, result: unknown): void {
    const message = { jsonrpc: "2.0", id, result };
    const body = JSON.stringify(message);
    const header = `Content-Length: ${Buffer.byteLength(body)}\r\n\r\n`;
    this.process?.stdin?.write(header + body);
  }

  private sendNotification(method: string, params: unknown): void {
    const message: JsonRpcNotification = { jsonrpc: "2.0", method, params };
    const body = JSON.stringify(message);
    const header = `Content-Length: ${Buffer.byteLength(body)}\r\n\r\n`;
    this.process?.stdin?.write(header + body);
  }

  private handleData(data: string): void {
    this.buffer += data;
    this.tryParse();
  }

  private tryParse(): void {
    while (true) {
      if (this.contentLength === -1) {
        const headerEnd = this.buffer.indexOf("\r\n\r\n");
        if (headerEnd === -1) return;
        const header = this.buffer.slice(0, headerEnd);
        const match = /Content-Length:\s*(\d+)/i.exec(header);
        if (!match) {
          // Skip malformed header
          this.buffer = this.buffer.slice(headerEnd + 4);
          continue;
        }
        this.contentLength = parseInt(match[1] ?? "0", 10);
        this.buffer = this.buffer.slice(headerEnd + 4);
      }

      if (Buffer.byteLength(this.buffer) < this.contentLength) return;

      // Extract exactly contentLength bytes
      const buf = Buffer.from(this.buffer);
      const bodyStr = buf.subarray(0, this.contentLength).toString();
      this.buffer = buf.subarray(this.contentLength).toString();
      this.contentLength = -1;

      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(bodyStr) as Record<string, unknown>;
      } catch {
        continue;
      }

      // Server-to-client request (has id + method) — respond with empty result
      if ("method" in parsed && "id" in parsed && parsed["id"] != null) {
        this.sendResponse(parsed["id"] as number, null);
        continue;
      }

      // Notification (has method, no id) — ignore
      if ("method" in parsed) continue;

      // Response (has id, no method)
      const id = parsed["id"] as number | undefined;
      if (id === undefined || id === null) continue;

      const pending = this.pending.get(id);
      if (!pending) continue;
      this.pending.delete(id);

      if (parsed["error"]) {
        const err = parsed["error"] as { code: number; message: string };
        pending.reject(new Error(`LSP error ${err.code}: ${err.message}`));
      } else {
        pending.resolve(parsed["result"]);
      }
    }
  }
}
