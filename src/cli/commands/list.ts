import { Command } from "commander";
import { getGlobalOptions } from "../context.js";
import { printOutput, successOutput } from "../output.js";
import { registry } from "../../engine/refactoring-registry.js";

export function createListCommand(): Command {
  return new Command("list")
    .description("List all available refactorings")
    .option("--tier <tier>", "filter by tier (1-4)")
    .action((opts: { tier?: string }, cmd: Command) => {
      const global = getGlobalOptions(cmd);
      const isJson = global.json ?? false;

      const tierNum = opts.tier ? (Number(opts.tier) as 1 | 2 | 3 | 4) : undefined;
      const refactorings = tierNum ? registry.listByTier(tierNum) : registry.listAll();

      const data = refactorings.map((r) => ({
        name: r.name,
        kebabName: r.kebabName,
        description: r.description,
        tier: r.tier,
      }));

      printOutput(successOutput("list", { refactorings: data, total: data.length }), isJson);
    });
}
