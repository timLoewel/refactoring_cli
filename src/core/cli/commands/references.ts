import { Command } from "commander";
import { getGlobalOptions } from "../context.js";
import { errorOutput, printOutput, successOutput } from "../output.js";
import { loadProject } from "../../project-model.js";
import { findReferences } from "../../symbol-resolver.js";

export function createReferencesCommand(): Command {
  return new Command("references")
    .description("Find all references to a symbol")
    .argument("<name>", "symbol name")
    .option("--transitive", "include transitive references (callers of callers)")
    .action((name: string, opts: { transitive?: boolean }, cmd: Command) => {
      const global = getGlobalOptions(cmd);
      const isJson = global.json ?? false;

      try {
        const { project } = loadProject({ path: global.path, config: global.config });
        const references = findReferences(project, name, { transitive: opts.transitive });
        printOutput(successOutput("references", { name, references }), isJson);
      } catch (error) {
        printOutput(
          errorOutput("references", [error instanceof Error ? error.message : String(error)]),
          isJson,
        );
        process.exitCode = 1;
      }
    });
}
