// Regression: extracting an array literal wrapped in `as const`
// (e.g. `items: ["a", "b"] as const`) should move the `as const` to
// the extracted variable declaration, not leave it on the reference.
// `varName as const` is invalid TS — const assertions only apply to literals.

export const params = {
  file: "fixture.ts",
  target: '["hello", "world"]',
  name: "extracted",
};

export function main() {
  const data = {
    items: ["hello", "world"] as const,
  };
  return data.items[0] + " " + data.items[1];
}
