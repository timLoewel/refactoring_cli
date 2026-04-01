/**
 * Shared Content-Length framing for JSON-RPC over streams/sockets.
 * Used by both PyrightClient (LSP over stdio) and the refactoring daemon (JSON-RPC over TCP).
 */

/** Encapsulates incremental parsing of Content-Length-framed messages */
export class FramingParser {
  private buffer = "";
  private contentLength = -1;

  /** Feed raw data into the parser. Returns an array of complete message bodies (strings). */
  feed(data: string): string[] {
    this.buffer += data;
    const messages: string[] = [];

    while (true) {
      if (this.contentLength === -1) {
        const headerEnd = this.buffer.indexOf("\r\n\r\n");
        if (headerEnd === -1) return messages;
        const header = this.buffer.slice(0, headerEnd);
        const match = /Content-Length:\s*(\d+)/i.exec(header);
        if (!match) {
          // Skip malformed header
          this.buffer = this.buffer.slice(headerEnd + 4);
          continue;
        }
        this.contentLength = parseInt(match[1] as string, 10);
        this.buffer = this.buffer.slice(headerEnd + 4);
      }

      if (Buffer.byteLength(this.buffer) < this.contentLength) return messages;

      // Extract exactly contentLength bytes
      const buf = Buffer.from(this.buffer);
      const bodyStr = buf.subarray(0, this.contentLength).toString();
      this.buffer = buf.subarray(this.contentLength).toString();
      this.contentLength = -1;

      messages.push(bodyStr);
    }
  }

  /** Reset the parser state, discarding any buffered data. */
  reset(): void {
    this.buffer = "";
    this.contentLength = -1;
  }
}

/** Frame a JSON body with Content-Length header for sending */
export function frameMessage(body: string): string {
  const header = `Content-Length: ${Buffer.byteLength(body)}\r\n\r\n`;
  return header + body;
}
