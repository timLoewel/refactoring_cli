export const params = {
  file: "fixture.ts",
  startLine: 10,
  endLine: 11,
  name: "computeSum",
};

export function main(): string {
  const a = 3;
  const b = 7;
  const sum = a + b;
  return String(sum);
}
