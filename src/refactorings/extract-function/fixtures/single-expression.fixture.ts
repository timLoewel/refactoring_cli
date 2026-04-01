export const params = {
  file: "fixture.ts",
  startLine: 11,
  endLine: 11,
  name: "computeTotal",
};

export function main(): string {
  const basePrice = 100;
  const taxRate = 0.08;
  const total = basePrice * (1 + taxRate);
  return total.toFixed(2);
}
