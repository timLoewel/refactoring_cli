export const params = { file: "fixture.ts", target: "greet" };

function greet(name: string = "World"): string {
  return `Hello, ${name}!`;
}

export function main(): string {
  const a = greet();
  const b = greet("Alice");
  return a + " " + b;
}
