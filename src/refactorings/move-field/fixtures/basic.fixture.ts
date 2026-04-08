export const params = {
  file: "fixture.ts",
  target: "Customer",
  field: "city",
  destination: "Order",
};

class Order {
  amount: number = 0;
}

class Customer {
  name: string = "";
  city: string = "";
  order: Order = new Order();
}

export function main(): string {
  const customer = new Customer();
  customer.name = "Carol";
  customer.city = "Portland";
  customer.order.amount = 42;
  return `${customer.name} from ${customer.city} ordered $${customer.order.amount}`;
}
