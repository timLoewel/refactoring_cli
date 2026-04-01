export const params = { file: "fixture.ts", target: "greeting", name: "getGreeting" };

export function main(): string {
  const greeting = "Hello, World";
  return greeting.toUpperCase();
}
