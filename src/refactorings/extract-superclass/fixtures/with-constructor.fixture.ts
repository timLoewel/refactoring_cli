export const params = {
  file: "fixture.ts",
  target: "Manager",
  methods: "greet",
  superclassName: "StaffMember",
};

class Manager {
  name: string = "Bob";
  department: string = "Sales";
  greet(): string {
    return "hello";
  }
  describe(): string {
    return `${this.name} runs ${this.department}`;
  }
}

export function main(): string {
  const mgr = new Manager();
  return `${mgr.greet()} — ${mgr.describe()}`;
}
