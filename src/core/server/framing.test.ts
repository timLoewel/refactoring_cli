import { FramingParser, frameMessage } from "./framing.js";

describe("frameMessage", () => {
  it("wraps body with Content-Length header", () => {
    const body = '{"jsonrpc":"2.0","id":1}';
    const framed = frameMessage(body);
    expect(framed).toBe(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`);
  });

  it("uses byte length not string length for non-ASCII", () => {
    const body = '{"msg":"über"}';
    const framed = frameMessage(body);
    expect(framed).toContain(`Content-Length: ${Buffer.byteLength(body)}`);
  });
});

describe("FramingParser", () => {
  let parser: FramingParser;

  beforeEach(() => {
    parser = new FramingParser();
  });

  it("parses a single complete message", () => {
    const body = '{"id":1}';
    const data = frameMessage(body);
    const messages = parser.feed(data);
    expect(messages).toEqual([body]);
  });

  it("parses multiple messages in a single chunk", () => {
    const body1 = '{"id":1}';
    const body2 = '{"id":2}';
    const data = frameMessage(body1) + frameMessage(body2);
    const messages = parser.feed(data);
    expect(messages).toEqual([body1, body2]);
  });

  it("handles incomplete message across multiple feeds", () => {
    const body = '{"id":1}';
    const full = frameMessage(body);
    const half = Math.floor(full.length / 2);

    const first = parser.feed(full.slice(0, half));
    expect(first).toEqual([]);

    const second = parser.feed(full.slice(half));
    expect(second).toEqual([body]);
  });

  it("handles header split across feeds", () => {
    const body = '{"id":1}';
    const full = frameMessage(body);
    // Split right in the middle of the header
    const splitAt = 5; // "Conte" | "nt-Length: ..."

    const first = parser.feed(full.slice(0, splitAt));
    expect(first).toEqual([]);

    const second = parser.feed(full.slice(splitAt));
    expect(second).toEqual([body]);
  });

  it("skips malformed headers", () => {
    const garbage = "Bad-Header: foo\r\n\r\n";
    const body = '{"id":1}';
    const valid = frameMessage(body);

    const messages = parser.feed(garbage + valid);
    expect(messages).toEqual([body]);
  });

  it("resets clears buffered data", () => {
    const body = '{"id":1}';
    const full = frameMessage(body);
    // Feed partial data
    parser.feed(full.slice(0, 5));
    parser.reset();
    // After reset, the partial data is gone — feeding the rest produces nothing
    const messages = parser.feed(full.slice(5));
    expect(messages).toEqual([]);
  });
});
