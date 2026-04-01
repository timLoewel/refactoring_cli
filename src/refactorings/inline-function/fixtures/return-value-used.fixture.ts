export const params = { file: "fixture.ts", target: "double" };

function double(x: number): number {
  return x * 2;
}

export function main(): string {
  const a = double(5);
  const b = double(3);
  return String(a + b);
}
