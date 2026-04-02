export const params = { file: "source.ts", target: "describe", destination: "dest.ts" };

import { describe } from "./source.js";

export function main(): string {
  return describe({ name: "test", value: 42 });
}
