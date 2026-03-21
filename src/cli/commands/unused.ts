import { Command } from "commander";
import { getGlobalOptions } from "../context.js";
import { printOutput, successOutput } from "../output.js";

export function createUnusedCommand(): Command {
  return new Command("unused")
    .description("Find unused symbols in the project")
    .option("--ignore-tests", "exclude test files from usage analysis")
    .action((opts: { ignoreTests?: boolean }, cmd: Command) => {
      const global = getGlobalOptions(cmd);
      const isJson = global.json ?? false;

      // Stub — will be implemented in Section 6
      printOutput(successOutput("unused", { symbols: [] }), isJson);
    });
}
