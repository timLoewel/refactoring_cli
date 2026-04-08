// Recursive function — precondition error (function calls itself).

export const params = {
  file: "fixture.ts",
  target: "factorial",
  expectRejection: true,
};

function factorial(n: number): number {
  return n <= 1 ? 1 : n * factorial(n - 1);
}

export function main(): string {
  return String(factorial(5));
}
