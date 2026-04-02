export const params = { file: "source.ts", target: "greet", destination: "dest.ts" };

import { greet } from "./source.js";

export function main(): string {
  return greet();
}
