export const params = { file: "source.ts", target: "calculateTax", destination: "dest.ts" };

import { calculateTax } from "./source";

export function main(): string {
  return calculateTax(100).toFixed(2);
}
