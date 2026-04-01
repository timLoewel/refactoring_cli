export const params = {
  file: "fixture.ts",
  target: "Person",
  fields: "street, city",
  newClassName: "Address",
};

class Person {
  name: string = "";
  age: number = 0;
  street: string = "";
  city: string = "";
}

export function main(): string {
  const p = new Person();
  p.name = "Alice";
  p.age = 30;
  return `${p.name} age ${p.age}`;
}
