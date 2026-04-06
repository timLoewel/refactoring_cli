export const params = { file: "fixture.ts", target: "processAndCount" };

let counter = 0;

function processAndCount(items: string[]): number {
  for (const item of items) {
    counter++;
  }
  return counter;
}

export function main(): string {
  counter = 0;
  const result1 = processAndCount(["a", "b"]);
  const result2 = processAndCount(["c"]);
  return `${result1},${result2}`;
}
