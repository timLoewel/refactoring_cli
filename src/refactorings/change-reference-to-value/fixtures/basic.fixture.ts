export const params = { file: "fixture.ts", target: "Money" };

class Money {
  amount: number;
  currency: string;

  constructor(amount: number, currency: string) {
    this.amount = amount;
    this.currency = currency;
  }
}

export function main(): string {
  const price = new Money(100, "USD");
  return `Price: ${price.amount} ${price.currency}`;
}
