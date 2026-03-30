import { Command } from "commander";
import { version } from "./version.js";
import { errorOutput, printOutput } from "./output.js";
import { createApplyCommand } from "./commands/apply.js";
import { createListCommand } from "./commands/list.js";
import { createDescribeCommand } from "./commands/describe.js";
import { createSearchCommand } from "./commands/search.js";
import { createReferencesCommand } from "./commands/references.js";
import { createUnusedCommand } from "./commands/unused.js";
import { createFixImportsCommand } from "./commands/fix-imports.js";
import { createHelpCommand } from "./commands/help.js";

export function createProgram(): Command {
  const program = new Command();

  program
    .name("refactor")
    .description(
      "Agent-consumable CLI for applying Martin Fowler's catalog of refactorings to TypeScript codebases",
    )
    .version(version)
    .option("--path <dir>", "path to the target project directory")
    .option("--config <tsconfig>", "path to tsconfig.json")
    .option("--json", "output as JSON")
    .option(
      "--lang <language>",
      "target language: typescript or python (auto-detected from file extension)",
    );

  program.addCommand(createApplyCommand());
  program.addCommand(createListCommand());
  program.addCommand(createDescribeCommand());
  program.addCommand(createSearchCommand());
  program.addCommand(createReferencesCommand());
  program.addCommand(createUnusedCommand());
  program.addCommand(createFixImportsCommand());
  program.addCommand(createHelpCommand());

  program.on("command:*", (operands: string[]) => {
    const isJson = program.opts<{ json?: boolean }>().json ?? false;
    printOutput(errorOutput("unknown", [`Unknown command: ${operands[0]}`]), isJson);
    process.exitCode = 1;
  });

  return program;
}
