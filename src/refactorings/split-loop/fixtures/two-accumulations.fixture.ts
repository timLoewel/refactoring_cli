// Split a loop that independently computes two separate lists into two loops.
// The for..of starts at line 9.
export const params = { file: "fixture.ts", target: "9" };

export function main(): string {
  const items = [1, 2, 3, 4];
  const doubled: number[] = [];
  const tripled: number[] = [];
  for (const n of items) {
    doubled.push(n * 2);
    tripled.push(n * 3);
  }
  return `doubled=${doubled.join(",")};tripled=${tripled.join(",")}`;
}
