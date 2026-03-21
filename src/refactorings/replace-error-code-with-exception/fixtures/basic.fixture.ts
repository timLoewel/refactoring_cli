export function main(): string {
  const result = divide(10, 0);
  return `result: ${result}`;
}

function divide(a: number, b: number): number {
  if (b === 0) {
    return -1;
  }
  return a / b;
}
