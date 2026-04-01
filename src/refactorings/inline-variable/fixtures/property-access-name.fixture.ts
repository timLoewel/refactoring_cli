// Regression: `obj.x` — the `x` after the dot is a property name, not a variable reference.
// It must not be replaced when inlining variable `x`.
export const params = { file: "fixture.ts", target: "x" };

export function main(): number {
  const x = 5;
  const obj = { x: 10 };
  return x + obj.x; // first `x` is a variable ref (inline → 5), second is a property name (unchanged)
}
