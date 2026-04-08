// Second half references variable declared in first half — precondition error.

export const params = { file: "fixture.ts", target: "7", expectRejection: true };

export function main(): string {
  const items = [1, 2, 3];
  for (const item of items) {
    const doubled = item * 2;
    const result = doubled + 1;
  }
  return "done";
}
