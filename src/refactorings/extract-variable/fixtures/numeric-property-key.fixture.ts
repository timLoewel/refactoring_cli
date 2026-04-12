export const params = { file: "fixture.ts", target: "1", name: "extracted" };

export function main(): string {
  const obj = { a: "hello", 1: "world" };
  const val = 1 + 1;
  return obj[1] + String(val);
}
