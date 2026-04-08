export const params = { file: "fixture.ts", target: "withTax", param: "rate" };

const RATE = 0.15;

function withTax(price: number, rate: number): number {
  return price + price * rate;
}

export function main(): string {
  const a = withTax(100, RATE);
  const b = withTax(200, RATE);
  const c = withTax(50, RATE);
  return [a, b, c].map(String).join(", ");
}
