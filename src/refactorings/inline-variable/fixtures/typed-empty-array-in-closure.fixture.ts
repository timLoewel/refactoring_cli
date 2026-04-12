// Variable with a type-annotated empty array literal `Array<number> = []` is
// captured in a closure. Inlining replaces `ref` with `[]`, which TypeScript
// infers as `never[]` — causing `.push(value)` to reject `number` arguments.

export const params = {
  file: "fixture.ts",
  target: "ref",
  expectRejection: true,
};

export function main(): number {
  const ref: Array<number> = [];
  const add = (value: number) => ref.push(value);
  add(1);
  add(2);
  return ref.length;
}
