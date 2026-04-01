export const params = { file: "fixture.ts", target: "square" };

const square = (n: number): number => n * n;

export function main(): string {
  const a = square(4);
  const b = square(3);
  return String(a + b);
}
