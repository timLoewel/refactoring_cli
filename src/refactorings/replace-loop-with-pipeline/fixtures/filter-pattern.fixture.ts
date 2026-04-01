export const params = { file: "fixture.ts", target: "6" };

export function main(): string {
  const nums = [1, 2, 3, 4, 5, 6];
  const evens: number[] = [];
  for (const n of nums) {
    if (n % 2 === 0) {
      evens.push(n);
    }
  }
  return evens.join(",");
}
