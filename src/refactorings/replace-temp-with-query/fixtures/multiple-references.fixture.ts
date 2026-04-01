export const params = { file: "fixture.ts", target: "tax", name: "calculateTax" };

export function main(): string {
  const price = 200;
  const tax = price * 0.08;
  const withTax = price + tax;
  const displayTax = tax.toFixed(2);
  return `${withTax} (tax: ${displayTax})`;
}
