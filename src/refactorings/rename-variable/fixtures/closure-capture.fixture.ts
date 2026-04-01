export const params = { file: "fixture.ts", target: "factor", name: "multiplier" };

export function main(): string {
  const factor = 3;
  const multiply = (x: number): number => x * factor;
  const apply = (fn: (n: number) => number, n: number): number => fn(n);
  return String(apply(multiply, 7));
}
