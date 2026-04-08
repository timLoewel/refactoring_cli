export const params = {
  file: "fixture.ts",
  startLine: 11,
  endLine: 12,
  name: "calculate",
};

export function main(): string {
  const a = 10;
  const b = 20;
  const sum = a + b;
  const result = sum * 2;
  return `result is ${result}`;
}
