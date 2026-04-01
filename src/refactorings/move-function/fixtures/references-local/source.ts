const TAX_RATE = 0.08;

export function calculateTax(amount: number): number {
  return amount * TAX_RATE;
}

export function otherCalc(x: number): number {
  return x * TAX_RATE;
}
