export const params = {
  file: "fixture.ts",
  target: "Employee",
  methods: "greet, farewell",
  superclassName: "Person",
};

class Employee {
  name: string = "";
  role: string = "";
  greet(): string {
    return "hello";
  }
  farewell(): string {
    return "goodbye";
  }
  describe(): string {
    return `${this.name} — ${this.role}`;
  }
}

export function main(): string {
  const emp = new Employee();
  emp.name = "Alice";
  emp.role = "Engineer";
  return `${emp.greet()} | ${emp.describe()} | ${emp.farewell()}`;
}
