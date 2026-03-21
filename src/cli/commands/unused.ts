import { Command } from "commander";
import { getGlobalOptions } from "../context.js";
import { errorOutput, printOutput, successOutput } from "../output.js";
import { loadProject } from "../../engine/project-model.js";
import { findUnused } from "../../engine/symbol-resolver.js";
import type { SymbolKind } from "../../engine/symbol-resolver.js";

export function createUnusedCommand(): Command {
  return new Command("unused")
    .description("Find unused symbols in the project")
    .option("--ignore-tests", "exclude test files from usage analysis")
    .option("--kind <kind>", "filter by kind (function, class, variable, interface, type, enum)")
    .action((opts: { ignoreTests?: boolean; kind?: string }, cmd: Command) => {
      const global = getGlobalOptions(cmd);
      const isJson = global.json ?? false;

      try {
        const { project } = loadProject({ path: global.path, config: global.config });
        const symbols = findUnused(project, {
          ignoreTests: opts.ignoreTests,
          kind: opts.kind as SymbolKind | undefined,
        });
        printOutput(successOutput("unused", { symbols }), isJson);
      } catch (error) {
        printOutput(
          errorOutput("unused", [error instanceof Error ? error.message : String(error)]),
          isJson,
        );
        process.exitCode = 1;
      }
    });
}
