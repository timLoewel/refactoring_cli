// Regression: `primary` is a property key in a type literal `{ primary: "primary" }`.
// It is a PropertySignature name — a binding context, not an extractable expression.
// Extracting `primary` should not create `const extracted = primary` at file scope.
// This fixture documents the rejection case — no params exported so all-fixtures skips it.
// apply(project, { file: "fixture.ts", target: "primary", name: "extracted" })
// should be rejected (no valid occurrences to extract).

export type ReadPreferenceMode = Readonly<{
  readonly primary: "primary";
  readonly secondary: "secondary";
}>;
