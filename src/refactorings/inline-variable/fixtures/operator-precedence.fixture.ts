export const params = { file: "fixture.ts", target: "sum" };

export function main(): string {
  const a = 3;
  const b = 4;
  const sum = a + b;
  return String(sum * 2);
}
