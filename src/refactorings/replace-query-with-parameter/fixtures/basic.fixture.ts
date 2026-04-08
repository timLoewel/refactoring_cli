export const params = {
  file: "fixture.ts",
  target: "calculateTotal",
  query: "TAX_RATE",
  paramName: "taxRate",
};

const TAX_RATE = 0.2;

function calculateTotal(price: number): number {
  return price + price * TAX_RATE;
}

export function main(): string {
  const total = calculateTotal(50);
  return String(total);
}
