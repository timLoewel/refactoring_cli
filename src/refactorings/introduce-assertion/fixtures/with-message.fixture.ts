export const params = {
  file: "fixture.ts",
  target: "divide",
  condition: "divisor !== 0",
  message: "divisor must not be zero",
};

function divide(dividend: number, divisor: number): number {
  return dividend / divisor;
}

export function main(): string {
  return String(divide(10, 2));
}
