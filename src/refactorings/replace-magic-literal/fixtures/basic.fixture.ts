export function main(): string {
  const price = 9.99;
  const discounted = price - 9.99 * 0.1;
  const tax = 9.99 * 0.07;
  return String(discounted + tax);
}
