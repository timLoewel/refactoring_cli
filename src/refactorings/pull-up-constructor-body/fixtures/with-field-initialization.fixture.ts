export const params = {
  file: "fixture.ts",
  target: "Employee",
};

class Person {
  name: string = "";
  age: number = 0;
  constructor() {}
}

class Employee extends Person {
  constructor() {
    super();
    this.name = "Alice";
    this.age = 30;
  }
}

export function main(): string {
  const emp = new Employee();
  return `${emp.name} age ${emp.age}`;
}
