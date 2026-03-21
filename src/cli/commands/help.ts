import { Command } from "commander";
import { getGlobalOptions } from "../context.js";
import { printOutput, successOutput } from "../output.js";

const HELP_TEXT = `refactor - TypeScript Refactoring CLI

Commands:
  apply <name>       Apply a refactoring transformation
  list               List all available refactorings
  describe <name>    Describe a refactoring in detail
  search <pattern>   Search for symbols in the project
  references <name>  Find all references to a symbol
  unused             Find unused symbols
  fix-imports        Detect and fix broken imports
  help               Show this help message

Global Options:
  --path <dir>       Path to the target project directory
  --config <file>    Path to tsconfig.json
  --json             Output as JSON
  --version          Show version
  --help             Show help

Examples:
  refactor list --json --tier 1
  refactor describe extract-function --json
  refactor apply extract-function --json --dry-run --file src/app.ts --start 10 --end 20 --name doStuff
  refactor search MyClass --kind class --json
  refactor references processData --transitive --json
  refactor unused --ignore-tests --json
  refactor fix-imports --auto --json
`;

export function createHelpCommand(): Command {
  return new Command("help")
    .description("Show usage guide with examples")
    .action((_opts: Record<string, unknown>, cmd: Command) => {
      const global = getGlobalOptions(cmd);
      const isJson = global.json ?? false;

      printOutput(successOutput("help", { text: HELP_TEXT }), isJson);
    });
}
