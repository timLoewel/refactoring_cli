// No params: arrow function const — not supported (FunctionDeclaration only).

import { multiply } from "./source";

export function main(): string {
  return String(multiply(6, 7));
}
