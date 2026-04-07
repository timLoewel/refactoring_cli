// No params: subclass is imported cross-file — precondition should reject
import { Circle } from "./base";

export function main(): string {
  const c = new Circle("circle");
  return c.describe();
}
