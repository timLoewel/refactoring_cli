import { Command } from "commander";
import { getGlobalOptions } from "../context.js";
import { printOutput, successOutput } from "../output.js";

export function createApplyCommand(): Command {
  return new Command("apply")
    .description("Apply a refactoring to the target project")
    .argument("<name>", "refactoring name (kebab-case)")
    .option("--dry-run", "preview changes without writing to disk")
    .action((name: string, opts: { dryRun?: boolean }, cmd: Command) => {
      const global = getGlobalOptions(cmd);
      const isJson = global.json ?? false;

      // Stub — will be implemented in Section 9
      printOutput(
        successOutput("apply", {
          refactoring: name,
          dryRun: opts.dryRun ?? false,
          message: "Not yet implemented",
        }),
        isJson,
      );
    });
}
