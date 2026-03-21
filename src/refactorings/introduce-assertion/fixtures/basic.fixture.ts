function computeDiscount(price: number, percent: number): number {
  return price * (percent / 100);
}

export function main(): string {
  const discounted = computeDiscount(200, 15);
  return String(discounted);
}
