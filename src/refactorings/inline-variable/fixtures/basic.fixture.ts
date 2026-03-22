export const params = {
  file: "fixture.ts",
  target: "greeting",
};

export function main(): string {
  const greeting = "Hello, world";
  const message = greeting + "!";
  return message;
}
