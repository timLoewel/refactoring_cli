// When an object literal contains a function expression that uses `this`,
// TypeScript infers the `this` type from the variable's structural type.
// Inlining the object into an argument typed as `unknown` loses this
// inference, causing `this` to become `{}` and property access to fail.
export const params = {
  file: "fixture.ts",
  target: "obj",
  expectRejection: true,
};

export function main() {
  function accept(val: unknown): unknown {
    return val;
  }
  const obj = {
    value: 42,
    getValue: function (): number {
      return this.value;
    },
  };
  const result = accept(obj) as { getValue: () => number };
  return result.getValue();
}
