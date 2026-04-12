// Regression: extracting a string literal that is an enum member initializer
// (e.g. `Kind = "Kind"`) is invalid — TypeScript enum initializers must be
// compile-time constant expressions, not variable references.
export const params = {
  file: "fixture.ts",
  target: '"Union"',
  name: "extracted",
  expectRejection: true,
};

enum Kind {
  Object = "Object",
  Union = "Union",
  Array = "Array",
}

export function main(): string {
  return Kind.Union;
}
