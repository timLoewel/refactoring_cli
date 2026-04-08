export const params = {
  file: "fixture.ts",
  target: "Employee",
};

class Person {
  name: string = "";
}

class Employee extends Person {
  constructor() {
    super();
    this.name = "default";
  }
}

export function main(): string {
  const employee = new Employee();
  return `${employee.name} is an employee`;
}
