import { Command } from "commander";
import { getGlobalOptions } from "../context.js";
import { printOutput, successOutput } from "../output.js";

export function createSearchCommand(): Command {
  return new Command("search")
    .description("Search for symbols in the project")
    .argument("<pattern>", "symbol name or pattern")
    .option("--kind <kind>", "filter by kind (function, class, variable, interface, type, enum)")
    .option("--exported", "only show exported symbols")
    .action((pattern: string, opts: { kind?: string; exported?: boolean }, cmd: Command) => {
      const global = getGlobalOptions(cmd);
      const isJson = global.json ?? false;

      // Stub — will be implemented in Section 6
      printOutput(
        successOutput("search", { pattern, kind: opts.kind ?? null, results: [] }),
        isJson,
      );
    });
}
