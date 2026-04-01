export const params = { file: "fixture.ts", target: "prefix" };

export function main(): string {
  const prefix = "Hello";
  const a = prefix + " Alice";
  const b = prefix + " Bob";
  return a + ", " + b;
}
