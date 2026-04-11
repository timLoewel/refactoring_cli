// When a file contains multiple variable declarations with the same name
// (in different scopes), the params {file, target} cannot disambiguate which
// one to inline. Reject to avoid non-deterministic behavior.
export const params = {
  file: "fixture.ts",
  target: "items",
  expectRejection: true,
};

function first<T>(arr: readonly T[]): T | undefined {
  return arr[0];
}

function sum(arr: readonly number[]): number {
  return arr.reduce((a, b) => a + b, 0);
}

export function main(): string {
  const result1 = (() => {
    const items: readonly number[] = [];
    return String(first(items));
  })();
  const result2 = (() => {
    const items: readonly number[] = [1, 2, 3];
    return String(sum(items));
  })();
  return result1 + "|" + result2;
}
