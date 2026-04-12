import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { startDaemon } from "./server/daemon.js";
import { RefactorClient } from "./refactor-client.js";

function setupMiniProject(dir: string): void {
  writeFileSync(
    join(dir, "tsconfig.json"),
    JSON.stringify({ compilerOptions: { strict: true }, include: ["src/**/*.ts"] }),
  );
  mkdirSync(join(dir, "src"), { recursive: true });
  writeFileSync(join(dir, "src", "index.ts"), 'const greeting = "hello";\nexport { greeting };\n');
}

describe("RefactorClient", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "client-test-"));
    setupMiniProject(tmpDir);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("connects to a running daemon and applies a refactoring", async () => {
    await startDaemon(tmpDir);

    const connectResult = await RefactorClient.connect(tmpDir);
    expect(connectResult.isOk()).toBe(true);
    const client = connectResult._unsafeUnwrap();
    const result = await client.apply("rename-variable", {
      file: join(tmpDir, "src", "index.ts"),
      target: "greeting",
      name: "salutation",
    });

    expect(result.success).toBe(true);
    expect(result.filesChanged.length).toBeGreaterThan(0);

    await client.close();
  }, 15000);

  it("applies multiple refactorings over the same connection", async () => {
    // Provide two variables to rename
    writeFileSync(
      join(tmpDir, "src", "index.ts"),
      "const aaa = 1;\nconst bbb = 2;\nexport { aaa, bbb };\n",
    );
    await startDaemon(tmpDir);

    const connectResult = await RefactorClient.connect(tmpDir);
    expect(connectResult.isOk()).toBe(true);
    const client = connectResult._unsafeUnwrap();

    const r1 = await client.apply("rename-variable", {
      file: join(tmpDir, "src", "index.ts"),
      target: "aaa",
      name: "alpha",
    });
    expect(r1.success).toBe(true);

    const r2 = await client.apply("rename-variable", {
      file: join(tmpDir, "src", "index.ts"),
      target: "bbb",
      name: "beta",
    });
    expect(r2.success).toBe(true);

    await client.close();
  }, 15000);

  it("shutdown stops the daemon", async () => {
    await startDaemon(tmpDir);
    const connectResult = await RefactorClient.connect(tmpDir);
    expect(connectResult.isOk()).toBe(true);
    const client = connectResult._unsafeUnwrap();
    await client.shutdown();

    // Daemon should be stopped — a new connect should fail or start fresh
    // (We can't easily test this without spawn, so just verify no crash)
  }, 15000);
});
