import { Command } from "commander";
import { getGlobalOptions } from "../context.js";
import { errorOutput, printOutput, successOutput } from "../output.js";
import { loadProject } from "../../project-model.js";
import { registry } from "../../refactoring-registry.js";
import { applyRefactoring } from "../../apply.js";

function parseKeyValueArgs(args: string[]): Record<string, unknown> {
  const params: Record<string, unknown> = {};
  for (const arg of args) {
    const eqIndex = arg.indexOf("=");
    if (eqIndex > 0) {
      params[arg.substring(0, eqIndex)] = arg.substring(eqIndex + 1);
    }
  }
  return params;
}

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
        const params = parseKeyValueArgs(cmd.args.slice(1));
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
