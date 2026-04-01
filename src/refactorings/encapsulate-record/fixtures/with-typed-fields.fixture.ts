export const params = { file: "fixture.ts", target: "Product" };

class Product {
  name: string = "Widget";
  price: number = 9.99;

  label(): string {
    return "Product";
  }
}

export function main(): string {
  const p = new Product();
  return p.label();
}
