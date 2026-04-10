import { Command } from "commander";
import { getGlobalOptions } from "../context.js";
import { errorOutput, printOutput, successOutput } from "../output.js";
import { loadProject } from "../../project-model.js";
import type { UnusedOptions } from "../../symbol-resolver.js";
import { findUnused } from "../../symbol-resolver.js";

export function createUnusedCommand(): Command {
  return new Command("unused")
    .description("Find unused symbols in the project")
    .option("--ignore-tests", "exclude test files from usage analysis")
    .option("--kind <kind>", "filter by kind (function, class, variable, interface, type, enum)")
    .action((opts: { ignoreTests?: boolean; kind?: string }, cmd: Command) => {
      const global = getGlobalOptions(cmd);
      const isJson = global.json ?? false;

      try {
        const loadResult = loadProject({ path: global.path, config: global.config });
        if (loadResult.isErr()) {
          printOutput(errorOutput("unused", [loadResult.error.message]), isJson);
          process.exitCode = 1;
          return;
        }
        const { project } = loadResult.value;
        const symbols = findUnused(project, {
          ignoreTests: opts.ignoreTests,
          kind: opts.kind as UnusedOptions["kind"],
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
