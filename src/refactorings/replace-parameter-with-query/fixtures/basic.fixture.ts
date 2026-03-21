const BASE_PRICE = 100;

function applyDiscount(price: number, discount: number): number {
  return price - price * (discount / 100);
}

export function main(): string {
  const result = applyDiscount(BASE_PRICE, 10);
  return String(result);
}
