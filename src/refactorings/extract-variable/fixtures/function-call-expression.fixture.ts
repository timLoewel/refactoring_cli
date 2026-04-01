export const params = { file: "fixture.ts", target: "Math.max(a, b)", name: "maximum" };

export function main(): string {
  const a = 10;
  const b = 20;
  const result = Math.max(a, b) * 2;
  return String(result);
}
