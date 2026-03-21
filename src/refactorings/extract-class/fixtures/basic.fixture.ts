class Person {
  name: string = "";
  age: number = 0;
  street: string = "";
  city: string = "";
}

export function main(): string {
  const person = new Person();
  person.name = "Alice";
  person.age = 30;
  person.street = "123 Main St";
  person.city = "Springfield";
  return `${person.name} lives at ${person.street}, ${person.city}`;
}
