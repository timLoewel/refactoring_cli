export const params = {
  file: "fixture.ts",
  target: "PremiumAccount",
  method: "formatBalance",
};

class Account {
  balance: number = 0;
}

class PremiumAccount extends Account {
  formatBalance(currency: string): string {
    return `${currency}${this.balance.toFixed(2)}`;
  }
}

export function main(): string {
  const acc = new PremiumAccount();
  acc.balance = 42.5;
  return acc.formatBalance("$");
}
