export const params = { file: "fixture.ts", target: "Product", field: "title", name: "label" };

class Product {
  title: string = "";
  price: number = 0;
}

export function main(): string {
  const p1 = new Product();
  const p2 = new Product();
  p1.title = "Widget";
  p2.title = "Gadget";
  return `${p1.title} and ${p2.title}`;
}
