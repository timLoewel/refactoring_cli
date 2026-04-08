export const params = { file: "fixture.ts", target: "divide" };

export function main(): string {
  const result = divide(10, 2);
  return `result: ${result}`;
}

function divide(a: number, b: number): number {
  if (b === 0) {
    return -1;
  }
  return a / b;
}
