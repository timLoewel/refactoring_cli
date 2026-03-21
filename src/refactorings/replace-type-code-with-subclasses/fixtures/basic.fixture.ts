export function main(): string {
  class Employee {
    name: string;
    type: string = "engineer";
    constructor(name: string) {
      this.name = name;
    }
    role(): string {
      if (this.type === "engineer") return "writes code";
      if (this.type === "manager") return "manages people";
      return "unknown role";
    }
  }

  const emp = new Employee("Alice");
  return `${emp.name}: ${emp.role()}`;
}
