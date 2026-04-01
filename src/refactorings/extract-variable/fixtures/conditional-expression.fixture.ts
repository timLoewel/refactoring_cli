export const params = { file: "fixture.ts", target: "n > 0 ? n : -n", name: "abs" };

export function main(): string {
  const n = -5;
  const result = n > 0 ? n : -n;
  return String(result);
}
