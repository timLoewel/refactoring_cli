export const params = {
  file: "fixture.ts",
  target: "Discount",
  typeField: "category",
};

class Discount {
  amount: number = 0;
  category: string = "standard";
  label(): string {
    return `discount-${this.amount}`;
  }
}

export function main(): string {
  const d = new Discount();
  d.amount = 5;
  return d.label();
}
