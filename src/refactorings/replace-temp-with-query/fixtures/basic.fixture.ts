export function main(): string {
  const basePrice = 50;
  const discount = basePrice * 0.2;
  const finalPrice = basePrice - discount;
  return String(finalPrice);
}
