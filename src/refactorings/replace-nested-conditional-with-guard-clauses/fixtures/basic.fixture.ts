function getPayAmount(employee: {
  isSeparated: boolean;
  isRetired: boolean;
  normalPayAmount: () => number;
}): number {
  if (employee.isSeparated) {
    return 0;
  } else {
    if (employee.isRetired) {
      return 0;
    } else {
      return employee.normalPayAmount();
    }
  }
}

export function main(): string {
  const emp = { isSeparated: false, isRetired: false, normalPayAmount: () => 1000 };
  return String(getPayAmount(emp));
}
