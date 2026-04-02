import type { Config } from "./types.js";

export function describe(config: Config): string {
  return `${config.name}: ${config.value}`;
}
