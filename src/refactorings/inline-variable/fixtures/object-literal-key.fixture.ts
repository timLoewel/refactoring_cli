// Regression: `{ x: 10 }` — the `x` as an object key must not be replaced when inlining `x`.
export const params = { file: "fixture.ts", target: "x" };

export function main(): number {
  const x = 42;
  const obj: Record<string, number> = { x: 100 };
  return x + (obj["x"] ?? 0); // `x` is inlined (→ 42), object key `x` and `"x"` are unchanged
}
