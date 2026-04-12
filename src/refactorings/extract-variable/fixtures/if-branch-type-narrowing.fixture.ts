export const params = {
  file: "fixture.ts",
  target: "value.a",
  name: "__reftest__",
  expectRejection: true,
};

type A = { key: "a"; a: number };
type B = { key: "b"; b: number };
type AB = A | B;

function process(value: AB): number {
  if (value.key === "a") return value.a;
  return 0;
}

export function main(): string {
  return String(process({ key: "a", a: 42 }));
}
