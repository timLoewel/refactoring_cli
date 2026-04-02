export const params = { file: "source.ts", target: "process", destination: "dest.ts" };

import { process } from "./source.js";

export function main(): string {
  return process("3.14");
}
