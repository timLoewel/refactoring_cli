// Bug: replace-temp-with-query creates a query function at the scope level,
// but when multiple variables in the same scope are replaced, or when a function
// with the same name already exists, it produces "Duplicate function implementation".

export const params = {
  file: "fixture.ts",
  target: "total",
  name: "getTotal",
};

function calculate(a: number, b: number): number {
  const total = a + b;
  return total * 2;
}

function process(x: number): string {
  const total = x * 3;
  return String(total);
}

export function main(): string {
  return String(calculate(3, 4)) + "," + process(5);
}
