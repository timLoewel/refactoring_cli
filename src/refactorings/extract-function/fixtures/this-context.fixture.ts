// No params: extraction with `this` reference — requires method extraction, not yet supported.

class Cart {
  items: number[] = [10, 20, 30];

  getTotal(): string {
    const sum = this.items.reduce((a, b) => a + b, 0);
    return `$${sum.toFixed(2)}`;
  }
}

export function main(): string {
  const cart = new Cart();
  return cart.getTotal();
}
