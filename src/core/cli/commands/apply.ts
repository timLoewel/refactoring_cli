import { Command } from "commander";
import { getGlobalOptions } from "../context.js";
import { errorOutput, printOutput, successOutput } from "../output.js";
import { loadProject } from "../../project-model.js";
import { registry } from "../../refactoring-registry.js";
import { applyRefactoring } from "../../apply.js";

export function parseKeyValueArgs(args: string[]): Record<string, unknown> {
  const params: Record<string, unknown> = {};
  for (const arg of args) {
    const eqIndex = arg.indexOf("=");
    if (eqIndex > 0) {
      params[arg.substring(0, eqIndex)] = arg.substring(eqIndex + 1);
    }
  }
  return params;
}

export function detectLanguage(
  params: Record<string, unknown>,
  explicitLang?: string,
): "typescript" | "python" {
  if (explicitLang === "python" || explicitLang === "typescript") {
    return explicitLang;
  }
  const file = params["file"];
  if (typeof file === "string") {
    if (file.endsWith(".py")) return "python";
    if (file.endsWith(".ts") || file.endsWith(".tsx")) return "typescript";
  }
  return "typescript";
}

export function createApplyCommand(): Command {
  return new Command("apply")
    .description("Apply a refactoring to the target project")
    .argument("<name>", "refactoring name (kebab-case)")
    .option("--dry-run", "preview changes without writing to disk")
    .allowUnknownOption(true)
    .allowExcessArguments(true)
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
        const params = parseKeyValueArgs(cmd.args.slice(1));
        const lang = detectLanguage(params, global.lang);

        if (lang !== def.language) {
          printOutput(
            errorOutput("apply", [
              `Refactoring '${name}' is for ${def.language}, but target is ${lang}`,
            ]),
            isJson,
          );
          process.exitCode = 1;
          return;
        }

        const { project } = loadProject({ path: global.path, config: global.config });
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
