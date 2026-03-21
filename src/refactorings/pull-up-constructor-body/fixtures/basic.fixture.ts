export function main(): string {
  class Person {
    name: string = "";
  }

  class Employee extends Person {
    role: string;
    constructor(name: string, role: string) {
      super();
      this.name = name;
      this.role = role;
    }
  }

  const employee = new Employee("Alice", "Engineer");
  return `${employee.name} is a ${employee.role}`;
}
