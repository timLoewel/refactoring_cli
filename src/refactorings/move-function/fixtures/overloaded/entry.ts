export const params = { file: "source.ts", target: "convert", destination: "dest.ts" };

import { convert } from "./source.js";

export function main(): string {
  const a = convert(42);
  const b = convert("7");
  return `${a},${b}`;
}
