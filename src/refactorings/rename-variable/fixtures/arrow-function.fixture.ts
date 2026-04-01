export const params = { file: "fixture.ts", target: "calculate", name: "compute" };

export function main(): string {
  const calculate = (x: number): number => x * 2;
  const a = calculate(5);
  const b = calculate(10);
  return String(a + b);
}
