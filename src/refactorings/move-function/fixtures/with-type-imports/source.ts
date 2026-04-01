import type { Config } from "./types";

export function describe(config: Config): string {
  return `${config.name}: ${config.value}`;
}
