// Bug: replace-magic-literal replaces ALL occurrences of a string literal
// including those in contexts where only string literals are valid,
// producing invalid code.

export const params = {
  file: "fixture.ts",
  target: "42",
  name: "MAGIC_NUMBER",
};

export function main(): string {
  const a = 42;
  const b = 42 + 1;
  return String(a + b);
}
