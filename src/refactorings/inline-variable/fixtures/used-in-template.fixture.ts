export const params = { file: "fixture.ts", target: "name" };

export function main(): string {
  const name = "Alice";
  return `Hello, ${name}!`;
}
