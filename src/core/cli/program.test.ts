import { createProgram } from "./program.js";

describe("CLI Program", () => {
  let stdoutData: string;
  let _stderrData: string;
  const originalStdoutWrite = process.stdout.write;
  const originalStderrWrite = process.stderr.write;
  const originalExitCode = process.exitCode;

  beforeEach(() => {
    stdoutData = "";
    _stderrData = "";
    process.exitCode = undefined;
    process.stdout.write = ((chunk: string): boolean => {
      stdoutData += chunk;
      return true;
    }) as typeof process.stdout.write;
    process.stderr.write = ((chunk: string): boolean => {
      _stderrData += chunk;
      return true;
    }) as typeof process.stderr.write;
  });

  afterEach(() => {
    process.stdout.write = originalStdoutWrite;
    process.stderr.write = originalStderrWrite;
    process.exitCode = originalExitCode;
  });

  function run(...args: string[]): void {
    const program = createProgram();
    program.exitOverride();
    try {
      program.parse(["node", "refactor", ...args]);
    } catch {
      // commander throws on --help, --version, unknown commands
    }
  }

  it("registers all subcommands", () => {
    const program = createProgram();
    const commandNames = program.commands.map((c) => c.name());
    expect(commandNames).toContain("apply");
    expect(commandNames).toContain("list");
    expect(commandNames).toContain("describe");
    expect(commandNames).toContain("search");
    expect(commandNames).toContain("references");
    expect(commandNames).toContain("unused");
    expect(commandNames).toContain("fix-imports");
    expect(commandNames).toContain("help");
  });

  it("outputs JSON envelope for list --json", () => {
    run("--json", "list");
    const output = JSON.parse(stdoutData) as { success: boolean; command: string };
    expect(output.success).toBe(true);
    expect(output.command).toBe("list");
  });

  it("outputs JSON envelope for help --json", () => {
    run("--json", "help");
    const output = JSON.parse(stdoutData) as { success: boolean; command: string };
    expect(output.success).toBe(true);
    expect(output.command).toBe("help");
  });

  it("supports --path global option", () => {
    const program = createProgram();
    program.parse(["node", "refactor", "--path", "/tmp", "list"]);
    expect(program.opts<{ path?: string }>().path).toBe("/tmp");
  });

  it("supports --config global option", () => {
    const program = createProgram();
    program.parse(["node", "refactor", "--config", "/tmp/tsconfig.json", "list"]);
    expect(program.opts<{ config?: string }>().config).toBe("/tmp/tsconfig.json");
  });
});
