import type { Command } from "commander";

export interface GlobalOptions {
  path?: string;
  config?: string;
  json?: boolean;
}

export function getGlobalOptions(cmd: Command): GlobalOptions {
  const root = cmd.parent ?? cmd;
  return root.opts<GlobalOptions>();
}
