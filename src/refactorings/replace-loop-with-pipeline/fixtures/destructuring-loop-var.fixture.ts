export const params = { file: "fixture.ts", target: "6" };

export function main(): string {
  const pairs = [{ a: 1, b: 2 }, { a: 3, b: 4 }];
  const sums: number[] = [];
  for (const { a, b } of pairs) {
    sums.push(a + b);
  }
  return sums.join(",");
}
