export const params = {
  file: "fixture.ts",
  target: "total",
};

class ShoppingCart {
  quantity: number = 5;
  price: number = 20;
  total: number = 5 * 20;
}

export function main(): string {
  const cart = new ShoppingCart();
  return `Total: ${cart.total}`;
}
