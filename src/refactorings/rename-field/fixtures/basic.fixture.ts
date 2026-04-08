export const params = { file: "fixture.ts", target: "Product", field: "title", name: "label" };

class Product {
  title: string = "";
  price: number = 0;
}

export function main(): string {
  const product = new Product();
  product.title = "Widget";
  product.price = 9.99;
  return `${product.title} costs $${product.price}`;
}
