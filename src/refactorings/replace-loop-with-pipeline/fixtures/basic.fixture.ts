export const params = { file: "fixture.ts", target: "6" };

export function main(): string {
  const numbers = [1, 2, 3, 4, 5];
  const doubled: number[] = [];
  for (const n of numbers) {
    doubled.push(n * 2);
  }
  return doubled.join(", ");
}
