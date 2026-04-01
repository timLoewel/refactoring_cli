// After refactoring, callers have undefined appended as the new argument.
export const params = {
  file: "fixture.ts",
  target: "greet",
  paramName: "suffix",
  paramType: "string | undefined",
};

function greet(name: string): string {
  return `Hello, ${name}!`;
}

export function main(): string {
  return greet("world");
}
