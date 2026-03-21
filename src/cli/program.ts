import { Command } from "commander";
import { version } from "./version.js";

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
    .option("--json", "output as JSON");

  return program;
}
