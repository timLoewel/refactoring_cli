// A literal that appears only once is not a "magic literal" — it's just a value.
// The refactoring should reject it.

export const params = {
  file: "fixture.ts",
  target: "42",
  name: "ANSWER",
  expectRejection: true,
};

export function main(): string {
  return String(42);
}
