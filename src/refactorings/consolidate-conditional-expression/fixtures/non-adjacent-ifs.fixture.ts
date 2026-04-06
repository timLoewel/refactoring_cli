export const params = { file: "fixture.ts", target: "4" };

function check(a: number, b: number): number {
  if (a < 0) return -1;
  if (b < 0) return -1;
  return a + b;
}

export function main(): string {
  return String(check(1, 2)) + "," + String(check(-1, 2)) + "," + String(check(1, -1));
}
