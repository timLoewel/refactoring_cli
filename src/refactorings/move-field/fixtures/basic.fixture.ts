class Customer {
  name: string = "";
  city: string = "";
}

class Order {
  amount: number = 0;
}

export function main(): string {
  const customer = new Customer();
  customer.name = "Carol";
  customer.city = "Portland";
  const order = new Order();
  order.amount = 42;
  return `${customer.name} from ${customer.city} ordered $${order.amount}`;
}
