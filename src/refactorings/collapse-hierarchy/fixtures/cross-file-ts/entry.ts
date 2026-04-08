export const params = { file: "base.ts", target: "Circle" };

import { Circle } from "./base.js";

export function main(): string {
  const c = new Circle("circle");
  return c.describe();
}
