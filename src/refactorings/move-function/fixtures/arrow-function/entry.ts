export const params = {
  file: "source.ts",
  target: "multiply",
  destination: "dest.ts",
  expectRejection: true,
};

import { multiply } from "./source.js";

export function main(): string {
  return String(multiply(6, 7));
}
