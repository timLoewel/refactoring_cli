export const params = { file: "source.ts", target: "add", destination: "dest.ts" };

import { add } from "./source";

export function main(): string {
  return String(add(3, 4));
}
