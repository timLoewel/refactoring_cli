function formatCurrency(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

export function main(): string {
  const price = 9.99;
  return formatCurrency(price);
}
