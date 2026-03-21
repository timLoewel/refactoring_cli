class Department {
  manager: string = "";

  getManager(): string {
    return this.manager;
  }
}

class Person {
  name: string = "";
  department: Department = new Department();
}

export function main(): string {
  const person = new Person();
  person.name = "Dave";
  person.department.manager = "Eve";
  return `${person.name}'s manager is ${person.department.getManager()}`;
}
