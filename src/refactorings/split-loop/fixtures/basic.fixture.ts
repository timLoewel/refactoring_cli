export const params = { file: "fixture.ts", target: "7" };

export function main(): string {
  const numbers = [1, 2, 3, 4, 5];
  const doubled: number[] = [];
  const squared: number[] = [];
  for (const n of numbers) {
    doubled.push(n * 2);
    squared.push(n * n);
  }
  return `doubled: ${doubled.join(",")}, squared: ${squared.join(",")}`;
}
