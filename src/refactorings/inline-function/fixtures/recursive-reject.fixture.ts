// No params: recursive function — precondition error (function calls itself).

function factorial(n: number): number {
  return n <= 1 ? 1 : n * factorial(n - 1);
}

export function main(): string {
  return String(factorial(5));
}
