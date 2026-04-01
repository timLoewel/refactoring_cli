export const params = {
  file: "fixture.ts",
  target: "Person",
  delegate: "address",
  method: "getCity",
};

class Address {
  city: string = "";

  getCity(): string {
    return this.city;
  }
}

class Person {
  name: string = "";
  address: Address = new Address();
}

export function main(): string {
  const p = new Person();
  p.name = "Alice";
  p.address.city = "Berlin";
  return `${p.name} lives in ${p.address.getCity()}`;
}
