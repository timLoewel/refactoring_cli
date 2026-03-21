import { Command } from "commander";
import { getGlobalOptions } from "../context.js";
import { printOutput, successOutput } from "../output.js";

export function createDescribeCommand(): Command {
  return new Command("describe")
    .description("Describe a refactoring (params, preconditions, example)")
    .argument("<name>", "refactoring name (kebab-case)")
    .action((name: string, _opts: Record<string, unknown>, cmd: Command) => {
      const global = getGlobalOptions(cmd);
      const isJson = global.json ?? false;

      // Stub — will be implemented in Section 7
      printOutput(successOutput("describe", { name, message: "Not yet implemented" }), isJson);
    });
}
