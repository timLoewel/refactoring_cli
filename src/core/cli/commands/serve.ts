import { Command } from "commander";
import { startDaemon } from "../../server/daemon.js";

export function createServeCommand(): Command {
  return new Command("serve")
    .description("Start the refactoring daemon server (foreground)")
    .requiredOption("--path <dir>", "path to the target project directory")
    .action(async (opts: { path: string }) => {
      await startDaemon(opts.path);
    });
}
