export function main(): string {
  const cart = new ShoppingCart(5, 20);
  return `Total: ${cart.total}`;
}

class ShoppingCart {
  quantity: number;
  price: number;
  total: number;

  constructor(quantity: number, price: number) {
    this.quantity = quantity;
    this.price = price;
    this.total = quantity * price;
  }
}
