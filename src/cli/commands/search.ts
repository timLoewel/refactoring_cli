import { Command } from "commander";
import { getGlobalOptions } from "../context.js";
import { errorOutput, printOutput, successOutput } from "../output.js";
import { loadProject } from "../../engine/project-model.js";
import { searchSymbols } from "../../engine/symbol-resolver.js";
import type { SymbolKind } from "../../engine/symbol-resolver.js";

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
        const { project } = loadProject({ path: global.path, config: global.config });
        const results = searchSymbols(project, pattern, {
          kind: opts.kind as SymbolKind | undefined,
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
