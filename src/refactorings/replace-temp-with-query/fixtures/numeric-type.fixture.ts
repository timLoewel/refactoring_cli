export const params = { file: "fixture.ts", target: "discount", name: "getDiscount" };

export function main(): string {
  const price = 100;
  const discount = price * 0.1;
  return String(price - discount);
}
