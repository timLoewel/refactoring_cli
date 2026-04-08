// A function that returns both negative and non-negative numeric values
// uses a result code pattern (e.g. -1/0/1 for comparison), not error codes.

export const params = {
  file: "fixture.ts",
  target: "compare",
  expectRejection: true,
};

function compare(a: number, b: number): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

export function main(): string {
  return [compare(1, 2), compare(2, 1), compare(2, 2)].join(",");
}
