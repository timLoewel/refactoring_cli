export function main(): string {
  const person = { name: "Alice", age: 30 };
  const label = formatPerson(person.name, person.age);
  return label;
}

function formatPerson(name: string, age: number): string {
  return `${name} is ${age} years old`;
}
