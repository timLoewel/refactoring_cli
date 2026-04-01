export const params = { file: "fixture.ts", target: "add" };

function add(a: number, b: number): number {
  return a + b;
}

export function main(): string {
  const result = add(3, 4);
  return String(result);
}
