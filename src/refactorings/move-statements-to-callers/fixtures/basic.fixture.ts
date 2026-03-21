function processOrder(id: string): void {
  console.log(`Processing order ${id}`);
  console.log("Order complete");
}

export function main(): string {
  processOrder("A1");
  processOrder("B2");
  return "orders processed";
}
