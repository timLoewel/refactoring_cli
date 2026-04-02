export const params = { file: "source.ts", target: "formatPrice", destination: "dest.ts" };

import { formatPrice } from "./source.js";

export function main(): string {
  return formatPrice(9.99);
}
