class Customer {
  name: string;

  constructor(name: string) {
    this.name = name;
  }
}

export function main(): string {
  const customer = new Customer("Alice");
  return `Hello, ${customer.name}`;
}
