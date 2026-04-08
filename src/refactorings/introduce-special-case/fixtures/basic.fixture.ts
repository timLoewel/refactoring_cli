export const params = {
  file: "fixture.ts",
  target: "Customer",
  specialValue: "unknown",
  specialClassName: "UnknownCustomer",
};

class Customer {
  name: string;
  constructor(name: string) {
    this.name = name;
  }
  getName(): string {
    return this.name;
  }
  getDiscount(): number {
    return 0;
  }
}

export function main(): string {
  const customer = new Customer("Alice");
  if (customer.getName() === "unknown") {
    return "no discount for unknown customers";
  }
  return `discount: ${customer.getDiscount()}`;
}
