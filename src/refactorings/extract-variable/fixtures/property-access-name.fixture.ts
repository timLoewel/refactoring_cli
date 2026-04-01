// Regression: `obj.foo` — the `foo` after the dot is a property name, not an expression.
// Extracting `foo` should not replace property names, only standalone identifier references.
// If there are no standalone references (only property names), the refactoring should be
// a no-op (no valid matches) so preconditions should reject it or targets=0.
export const params = { file: "fixture.ts", target: "count", name: "extracted" };

export function main(): number {
  const count = 5;
  const arr = { count: 10 };
  return count + arr.count; // only the standalone `count` is extracted, `arr.count` is unchanged
}
