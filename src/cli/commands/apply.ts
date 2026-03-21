import { Command } from "commander";
import { getGlobalOptions } from "../context.js";
import { errorOutput, printOutput, successOutput } from "../output.js";
import { loadProject } from "../../engine/project-model.js";
import { registry } from "../../engine/refactoring-registry.js";
import { applyRefactoring } from "../../engine/apply.js";

export function createApplyCommand(): Command {
  return new Command("apply")
    .description("Apply a refactoring to the target project")
    .argument("<name>", "refactoring name (kebab-case)")
    .option("--dry-run", "preview changes without writing to disk")
    .allowUnknownOption(true)
    .action((name: string, opts: { dryRun?: boolean }, cmd: Command) => {
      const global = getGlobalOptions(cmd);
      const isJson = global.json ?? false;

      const def = registry.lookup(name);
      if (!def) {
        printOutput(errorOutput("apply", [`Unknown refactoring: ${name}`]), isJson);
        process.exitCode = 1;
        return;
      }

      try {
        const { project } = loadProject({ path: global.path, config: global.config });

        // Collect remaining args as params (key=value pairs)
        const params: Record<string, unknown> = {};
        const rawArgs = cmd.args.slice(1); // skip the refactoring name
        for (const arg of rawArgs) {
          const eqIndex = arg.indexOf("=");
          if (eqIndex > 0) {
            const key = arg.substring(0, eqIndex);
            const value = arg.substring(eqIndex + 1);
            params[key] = value;
          }
        }

        const result = applyRefactoring(def, project, params, { dryRun: opts.dryRun });
        printOutput(successOutput("apply", result), isJson);
        if (!result.success) {
          process.exitCode = 1;
        }
      } catch (error) {
        printOutput(
          errorOutput("apply", [error instanceof Error ? error.message : String(error)]),
          isJson,
        );
        process.exitCode = 1;
      }
    });
}
