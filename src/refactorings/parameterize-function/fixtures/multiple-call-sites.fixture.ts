export const params = {
  file: "fixture.ts",
  target: "greet",
  paramName: "prefix",
  paramType: "string | undefined",
};

function greet(name: string): string {
  return `Hello, ${name}`;
}

export function main(): string {
  const a = greet("Alice");
  const b = greet("Bob");
  const c = greet("Carol");
  return [a, b, c].join("; ");
}
