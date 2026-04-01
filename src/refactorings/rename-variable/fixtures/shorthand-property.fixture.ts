export const params = { file: "fixture.ts", target: "name", name: "label" };

export function main(): string {
  const name = "Alice";
  const obj = { name };
  return Object.values(obj)[0]!;
}
