export const params = {
  file: "fixture.ts",
  target: "x.foo",
  name: "__reftest__",
  expectRejection: true,
};

function process(x: { foo: number } | null): number {
  return x != null ? x.foo : 0;
}

export function main(): string {
  return String(process({ foo: 42 }));
}
