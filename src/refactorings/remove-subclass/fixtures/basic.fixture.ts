export const params = { file: "fixture.ts", target: "RushOrder" };

class Order {
  amount: number;
  constructor(amount: number) {
    this.amount = amount;
  }
  total(): number {
    return this.amount;
  }
}

class RushOrder extends Order {
  rushFee(): number {
    return this.amount * 0.1;
  }
}

export function main(): string {
  const order = new RushOrder(100);
  return `Total: ${order.total()}, fee: ${order.rushFee()}`;
}
