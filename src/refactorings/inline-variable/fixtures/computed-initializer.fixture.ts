export const params = { file: "fixture.ts", target: "ratio" };

export function main(): string {
  const total = 100;
  const part = 30;
  const ratio = part / total;
  return ratio.toFixed(2);
}
