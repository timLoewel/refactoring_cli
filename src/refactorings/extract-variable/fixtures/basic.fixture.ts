export const params = {
  file: "fixture.ts",
  target: "price * 0.1",
  name: "taxAmount",
};

export function main(): string {
  const price = 100;
  const tax = price * 0.1;
  const total = price * 0.1 + price;
  return String(total + tax);
}
