export const params = { file: "fixture.ts", target: "`Hello, ${name}!`", name: "greeting" };

export function main(): string {
  const name = "World";
  const msg = `Hello, ${name}!`;
  return msg;
}
