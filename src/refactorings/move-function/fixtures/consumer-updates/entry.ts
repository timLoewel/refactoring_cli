export const params = { file: "source.ts", target: "helper", destination: "dest.ts" };

import { useHelper } from "./consumer.js";

export function main(): string {
  return useHelper();
}
