import { ResultAsync, okAsync, errAsync } from "neverthrow";
import { frameMessage } from "./server/framing.js";
import { connectOrSpawn, type DaemonConnection } from "./server/connect.js";
import type { ApplyResult } from "./refactoring.types.js";
import type { ConnectionError } from "./errors.js";

export class RefactorClient {
  private conn: DaemonConnection;
  private nextId = 1;
  private pending = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (error: Error) => void }
  >();

  private constructor(conn: DaemonConnection) {
    this.conn = conn;

    this.conn.socket.on("data", (data: Buffer) => {
      const messages = this.conn.parser.feed(data.toString("utf-8"));
      for (const msg of messages) {
        this.dispatch(msg);
      }
    });

    this.conn.socket.on("error", () => {
      for (const [, req] of this.pending) {
        req.reject(new Error("Connection lost"));
      }
      this.pending.clear();
    });
  }

  static connect(projectRoot: string): ResultAsync<RefactorClient, ConnectionError> {
    return ResultAsync.fromPromise(
      connectOrSpawn(projectRoot),
      (): ConnectionError => ({
        kind: "connection",
        message: "Failed to connect to refactoring daemon",
      }),
    ).andThen((conn) => {
      if (!conn) {
        return errAsync<RefactorClient, ConnectionError>({
          kind: "connection",
          message: "Failed to connect to refactoring daemon",
        });
      }
      return okAsync<RefactorClient, ConnectionError>(new RefactorClient(conn));
    });
  }

  async apply(
    name: string,
    params: Record<string, unknown>,
    options: { dryRun?: boolean } = {},
  ): Promise<ApplyResult> {
    const result = await this.sendRequest("apply", {
      name,
      params,
      dryRun: options.dryRun ?? false,
    });
    return result as ApplyResult;
  }

  async refresh(files: string[]): Promise<void> {
    await this.sendRequest("refresh", { files });
  }

  async close(): Promise<void> {
    this.conn.socket.end();
  }

  async shutdown(): Promise<void> {
    await this.sendRequest("shutdown", {});
    this.conn.socket.end();
  }

  private sendRequest(method: string, params: Record<string, unknown>): Promise<unknown> {
    const id = this.nextId++;
    const body = JSON.stringify({ jsonrpc: "2.0", id, method, params });

    return new Promise<unknown>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.conn.socket.write(frameMessage(body));
    });
  }

  private dispatch(bodyStr: string): void {
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(bodyStr) as Record<string, unknown>;
    } catch {
      return;
    }

    const id = parsed["id"] as number | undefined;
    if (id === undefined || id === null) return;

    const pending = this.pending.get(id);
    if (!pending) return;
    this.pending.delete(id);

    if (parsed["error"]) {
      const err = parsed["error"] as { code: number; message: string };
      pending.reject(new Error(`Daemon error ${err.code}: ${err.message}`));
    } else {
      pending.resolve(parsed["result"]);
    }
  }
}
