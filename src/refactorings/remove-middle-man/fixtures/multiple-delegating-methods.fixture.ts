export const params = {
  file: "fixture.ts",
  target: "Employee",
  delegate: "department",
};

class Department {
  name: string = "Engineering";
  budget: number = 50000;

  getName(): string {
    return this.name;
  }

  getBudget(): number {
    return this.budget;
  }
}

class Employee {
  id: number = 1;
  department: Department = new Department();

  getDepartmentName(): string {
    return this.department.getName();
  }

  getDepartmentBudget(): number {
    return this.department.getBudget();
  }
}

export function main(): string {
  const emp = new Employee();
  return `employee:${emp.id}`;
}
