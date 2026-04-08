// Const variable — precondition error.

export const params = { file: "fixture.ts", target: "x", expectRejection: true };

export function main(): string {
  const x = 42;
  return String(x);
}
