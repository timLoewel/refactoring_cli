export const params = { file: "fixture.ts", target: "discount", name: "getDiscount" };

export function main(): string {
  const basePrice = 50;
  const discount = basePrice * 0.2;
  const finalPrice = basePrice - discount;
  return String(finalPrice);
}
