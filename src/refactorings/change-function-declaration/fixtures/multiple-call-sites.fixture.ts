export const params = { file: "fixture.ts", target: "add", name: "sum" };

function add(a: number, b: number): number {
  return a + b;
}

export function main(): string {
  const r1 = add(1, 2);
  const r2 = add(10, 20);
  const r3 = r1 > 0 ? add(r1, r2) : 0;
  return `${r1},${r2},${r3}`;
}
