export const params = { file: "fixture.ts", target: "result", name: "compute" };

export function main(): string {
  const base = 10;
  const multiplier = 3;
  const result = base * multiplier;
  return String(result);
}
