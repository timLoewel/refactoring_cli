export const params = { file: "fixture.ts", target: "9.99", name: "BASE_PRICE" };

export function main(): string {
  const price = 9.99;
  const discounted = price - 9.99 * 0.1;
  const tax = 9.99 * 0.07;
  return String(discounted + tax);
}
