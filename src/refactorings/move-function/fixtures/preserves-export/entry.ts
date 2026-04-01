export const params = { file: "source.ts", target: "compute", destination: "dest.ts" };

import { compute } from "./source";

export function main(): string {
  return String(compute(21));
}
