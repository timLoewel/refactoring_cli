// A variable holding a function reference is not a primitive.
// The refactoring should reject it even without an explicit type annotation.

export const params = {
  file: "fixture.ts",
  target: "double",
  className: "Doubler",
  expectRejection: true,
};

const double = (x: number): number => x * 2;

export function main(): string {
  return String(double(21));
}
