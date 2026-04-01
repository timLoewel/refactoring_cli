export const params = {
  file: "fixture.ts",
  target: "applyDiscount",
  condition: "percent >= 0 && percent <= 100",
};

function applyDiscount(price: number, percent: number): number {
  return price * (1 - percent / 100);
}

export function main(): string {
  return String(applyDiscount(200, 10));
}
