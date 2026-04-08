// Traditional indexed for-loop — precondition error (not a for-of).

export const params = { file: "fixture.ts", target: "8", expectRejection: true };

export function main(): string {
  const items = [1, 2, 3];
  const result: number[] = [];
  for (let i = 0; i < items.length; i++) {
    result.push(items[i] * 2);
  }
  return result.join(",");
}
