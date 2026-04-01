export const params = {
  file: "fixture.ts",
  target: "Manager",
  field: "department",
};

class Employee {
  name: string = "Bob";
}

class Manager extends Employee {
  protected department: string = "Engineering";
  describe(): string {
    return `${this.name} manages ${this.department}`;
  }
}

export function main(): string {
  const mgr = new Manager();
  return mgr.describe();
}
