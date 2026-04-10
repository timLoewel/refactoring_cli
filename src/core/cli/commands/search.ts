import { Command } from "commander";
import { getGlobalOptions } from "../context.js";
import { errorOutput, printOutput, successOutput } from "../output.js";
import { loadProject } from "../../project-model.js";
import type { SearchOptions } from "../../symbol-resolver.js";
import { searchSymbols } from "../../symbol-resolver.js";

export function createSearchCommand(): Command {
  return new Command("search")
    .description("Search for symbols in the project")
    .argument("<pattern>", "symbol name or pattern")
    .option("--kind <kind>", "filter by kind (function, class, variable, interface, type, enum)")
    .option("--exported", "only show exported symbols")
    .action((pattern: string, opts: { kind?: string; exported?: boolean }, cmd: Command) => {
      const global = getGlobalOptions(cmd);
      const isJson = global.json ?? false;

      try {
        const loadResult = loadProject({ path: global.path, config: global.config });
        if (loadResult.isErr()) {
          printOutput(errorOutput("search", [loadResult.error.message]), isJson);
          process.exitCode = 1;
          return;
        }
        const { project } = loadResult.value;
        const results = searchSymbols(project, pattern, {
          kind: opts.kind as SearchOptions["kind"],
          exported: opts.exported,
        });
        printOutput(successOutput("search", { pattern, results }), isJson);
      } catch (error) {
        printOutput(
          errorOutput("search", [error instanceof Error ? error.message : String(error)]),
          isJson,
        );
        process.exitCode = 1;
      }
    });
}
