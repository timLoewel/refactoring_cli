// Regression: `primary` is a property key in a type literal `{ primary: "primary" }`.
// It is a PropertySignature name — a binding context, not an extractable expression.
// Extracting `primary` should not create `const extracted = primary` at file scope.

export const params = {
  file: "fixture.ts",
  target: "primary",
  name: "extracted",
  expectRejection: true,
};

export type ReadPreferenceMode = Readonly<{
  readonly primary: "primary";
  readonly secondary: "secondary";
}>;

export function main(): string {
  const mode: ReadPreferenceMode["primary"] = "primary";
  return mode;
}
