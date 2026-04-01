export const params = { file: "fixture.ts", target: 5, destination: 3 };

const a = 10;
const b = 20;
const c = 30;

export function main(): string {
  return String(a + b + c);
}
