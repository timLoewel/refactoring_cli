export const params = {
  file: "fixture.ts",
  target: "Person",
  delegate: "department",
};

class Department {
  manager: string = "Eve";

  getManager(): string {
    return this.manager;
  }
}

class Person {
  name: string = "";
  department: Department = new Department();

  getManager(): string {
    return this.department.getManager();
  }
}

export function main(): string {
  const person = new Person();
  person.name = "Dave";
  return `${person.name}'s manager is ${person.getManager()}`;
}
