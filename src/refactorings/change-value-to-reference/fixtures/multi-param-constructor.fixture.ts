export const params = {
  file: "fixture.ts",
  target: "Product",
};

class Product {
  id: string;
  name: string;
  price: number;

  constructor(id: string, name: string, price: number) {
    this.id = id;
    this.name = name;
    this.price = price;
  }
}

export function main(): string {
  const product = new Product("p1", "Widget", 9.99);
  return `${product.id}: ${product.name} ($${product.price})`;
}
