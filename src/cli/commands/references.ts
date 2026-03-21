import { Command } from "commander";
import { getGlobalOptions } from "../context.js";
import { printOutput, successOutput } from "../output.js";

export function createReferencesCommand(): Command {
  return new Command("references")
    .description("Find all references to a symbol")
    .argument("<name>", "symbol name")
    .option("--transitive", "include transitive references (callers of callers)")
    .action((name: string, opts: { transitive?: boolean }, cmd: Command) => {
      const global = getGlobalOptions(cmd);
      const isJson = global.json ?? false;

      // Stub — will be implemented in Section 6
      printOutput(successOutput("references", { name, references: [] }), isJson);
    });
}
