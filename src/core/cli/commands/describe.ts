import { Command } from "commander";
import { getGlobalOptions } from "../context.js";
import { errorOutput, printOutput, successOutput } from "../output.js";
import { registry } from "../../refactoring-registry.js";

export function createDescribeCommand(): Command {
  return new Command("describe")
    .description("Describe a refactoring (params, preconditions, example)")
    .argument("<name>", "refactoring name (kebab-case)")
    .action((name: string, _opts: Record<string, unknown>, cmd: Command) => {
      const global = getGlobalOptions(cmd);
      const isJson = global.json ?? false;

      const def = registry.lookup(name);
      if (!def) {
        printOutput(errorOutput("describe", [`Unknown refactoring: ${name}`]), isJson);
        process.exitCode = 1;
        return;
      }

      const data = {
        name: def.name,
        kebabName: def.kebabName,
        description: def.description,
        tier: def.tier,
        params: def.params.definitions,
      };

      printOutput(successOutput("describe", data), isJson);
    });
}
