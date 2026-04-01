export const params = { file: "fixture.ts", target: "factorial", name: "fact" };

function factorial(n: number): number {
  return n <= 1 ? 1 : n * factorial(n - 1);
}

export function main(): string {
  return String(factorial(5));
}
