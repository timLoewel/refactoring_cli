export const params = { file: "source.ts", target: "greet", destination: "dest.ts" };

import { greet } from "./source";

export function main(): string {
  return greet();
}
