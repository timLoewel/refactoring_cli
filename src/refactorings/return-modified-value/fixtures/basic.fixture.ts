export const params = { file: "fixture.ts", target: "applyDiscount" };

interface Order {
  items: string[];
  discount: number;
}

function applyDiscount(order: Order): void {
  order.discount = 10;
}

export function main(): string {
  const myOrder: Order = { items: ["apple", "banana"], discount: 0 };
  applyDiscount(myOrder);
  return String(myOrder.discount);
}
