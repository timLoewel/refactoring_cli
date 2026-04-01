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
  const a = new Money(10, "USD");
  return `${a.amount}-${a.currency}`;
}
