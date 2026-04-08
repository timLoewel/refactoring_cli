// A for-of loop with a return statement cannot be converted to forEach
// because return inside forEach exits the callback, not the function.

export const params = {
  file: "fixture.ts",
  target: "9",
  expectRejection: true,
};

function findFirst(items: number[]): number {
  // Line 9 (approx): the for-of loop
  for (const item of items) {
    if (item > 10) {
      return item;
    }
  }
  return -1;
}

export function main(): string {
  return String(findFirst([1, 5, 15, 20]));
}
