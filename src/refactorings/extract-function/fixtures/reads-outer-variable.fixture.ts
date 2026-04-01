export const params = {
  file: "fixture.ts",
  startLine: 11,
  endLine: 11,
  name: "computeResult",
};

export function main(): string {
  const factor = 5;
  const input = 7;
  const result = factor * input;
  return String(result);
}
