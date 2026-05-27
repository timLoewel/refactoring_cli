// A temp variable referenced both as a value and inside a `typeof` type query.
// The value reference becomes a query call, but the `typeof result` reference
// must become `ReturnType<typeof query>` — a call expression is not valid in a
// type position. Distilled from date-fns previousSunday/test.ts.

export const params = { file: "fixture.ts", target: "result", name: "getResult" };

export function main(): string {
  const result = compute();
  type R = typeof result;
  const echoed: R = result;
  return String(echoed);
}

function compute(): number {
  return 42;
}
