import { mkdtempSync, existsSync, readFileSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { write, read, unlink, portfilePath } from "./portfile.js";

describe("portfile", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "portfile-test-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("writes port and token to the portfile", () => {
    write(tmpDir, 54321, "abc123");
    const content = readFileSync(portfilePath(tmpDir), "utf-8");
    expect(content).toBe("54321 abc123");
  });

  it("reads back written data", () => {
    write(tmpDir, 12345, "tokenXYZ");
    const data = read(tmpDir);
    expect(data).toEqual({ port: 12345, token: "tokenXYZ" });
  });

  it("returns null when portfile does not exist", () => {
    expect(read(tmpDir)).toBeNull();
  });

  it("returns null for malformed content", () => {
    writeFileSync(portfilePath(tmpDir), "garbage");
    expect(read(tmpDir)).toBeNull();
  });

  it("returns null for non-integer port", () => {
    writeFileSync(portfilePath(tmpDir), "notaport token");
    expect(read(tmpDir)).toBeNull();
  });

  it("unlinks the portfile", () => {
    write(tmpDir, 9999, "tok");
    expect(existsSync(portfilePath(tmpDir))).toBe(true);
    unlink(tmpDir);
    expect(existsSync(portfilePath(tmpDir))).toBe(false);
  });

  it("unlink does not throw if portfile missing", () => {
    expect(() => unlink(tmpDir)).not.toThrow();
  });
});
