export const params = { file: "fixture.ts", target: "count", name: "total" };

export function main(): string {
  const count = 42;
  return `value is ${count}, doubled is ${count * 2}`;
}
