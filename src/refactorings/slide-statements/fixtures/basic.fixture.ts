export const params = { file: "fixture.ts", target: 6, destination: 5 };

export function main(): string {
  const a = 1;
  const c = 3;
  const b = 2;
  const result = a + b + c;
  return String(result);
}
