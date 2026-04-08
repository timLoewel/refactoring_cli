// for-in loop — precondition error (not a for-of, rejected cleanly).

export const params = { file: "fixture.ts", target: "8", expectRejection: true };

export function main(): string {
  const obj: Record<string, number> = { a: 1, b: 2 };
  const keys: string[] = [];
  for (const key in obj) {
    keys.push(key);
  }
  return keys.join(",");
}
