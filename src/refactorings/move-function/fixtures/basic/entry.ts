export const params = { file: "source.ts", target: "formatCurrency", destination: "dest.ts" };

import { formatCurrency } from "./source.js";

export function main(): string {
  const price = 9.99;
  return formatCurrency(price);
}
