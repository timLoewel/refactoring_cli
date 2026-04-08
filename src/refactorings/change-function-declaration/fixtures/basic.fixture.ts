export const params = { file: "fixture.ts", target: "computeTotal", name: "sumValues" };

function computeTotal(a: number, b: number): number {
  return a + b;
}

export function main(): string {
  const x = computeTotal(3, 4);
  const y = computeTotal(10, 20);
  return `totals: ${x} and ${y}`;
}
