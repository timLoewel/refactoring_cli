export const params = {
  file: "fixture.ts",
  target: "Product",
  fields: "weight, dimensions",
  newClassName: "PhysicalSpec",
};

class Product {
  name: string = "";
  price: number = 0;
  weight: number = 0;
  dimensions: string = "";
  label(): string {
    return `${this.name} $${this.price}`;
  }
}

export function main(): string {
  const p = new Product();
  p.name = "Widget";
  p.price = 9;
  return p.label();
}
