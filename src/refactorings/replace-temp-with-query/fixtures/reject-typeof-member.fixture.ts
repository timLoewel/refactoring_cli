// A temp used in a complex `typeof` query (`typeof result.value`) rather than a
// bare `typeof result`. Rewriting it as a query call is not a simple
// `ReturnType<...>` substitution, so it is rejected.

export const params = {
  file: "fixture.ts",
  target: "result",
  name: "getResult",
  expectRejection: true,
};

export function main(): string {
  const result = { value: 42 };
  type V = typeof result.value;
  const echoed: V = result.value;
  return String(echoed);
}
