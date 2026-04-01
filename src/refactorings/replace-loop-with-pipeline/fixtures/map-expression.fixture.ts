export const params = { file: "fixture.ts", target: "6" };

export function main(): string {
  const prices = [10, 20, 30];
  const withTax: number[] = [];
  for (const price of prices) {
    withTax.push(price + 10);
  }
  return withTax.join(",");
}
