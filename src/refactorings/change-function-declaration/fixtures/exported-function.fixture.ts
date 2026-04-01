export const params = { file: "fixture.ts", target: "greet", name: "sayHello" };

export function greet(name: string): string {
  return `Hello, ${name}!`;
}

export function main(): string {
  return greet("World");
}
