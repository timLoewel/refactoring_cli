export const params = { file: "fixture.ts", target: "count", name: "total" };

export function main(): string {
  let count = 0;
  count += 10;
  count = count * 2;
  return String(count);
}
