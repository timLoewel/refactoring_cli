import { Command } from "commander";
import { getGlobalOptions } from "../context.js";
import { printOutput, successOutput } from "../output.js";

export function createListCommand(): Command {
  return new Command("list")
    .description("List all available refactorings")
    .option("--tier <tier>", "filter by tier (1-4)")
    .action((opts: { tier?: string }, cmd: Command) => {
      const global = getGlobalOptions(cmd);
      const isJson = global.json ?? false;

      // Stub — will be implemented in Section 7
      printOutput(successOutput("list", { refactorings: [], tier: opts.tier ?? null }), isJson);
    });
}
