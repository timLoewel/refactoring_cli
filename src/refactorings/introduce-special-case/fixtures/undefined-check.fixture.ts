export const params = {
  file: "fixture.ts",
  target: "Employee",
  specialValue: "ghost",
  specialClassName: "GhostEmployee",
};

class Employee {
  id: number;
  constructor(id: number) {
    this.id = id;
  }
  getId(): number {
    return this.id;
  }
  getDepartment(): string {
    return "general";
  }
}

export function main(): string {
  const e = new Employee(7);
  return `${e.getId()}:${e.getDepartment()}`;
}
