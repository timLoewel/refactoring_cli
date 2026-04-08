// Extracting a method callee (property access used as call target) breaks `this` binding.
// `promise.then(cb)` → `const v = promise.then; v(cb)` loses `promise` as receiver.
export const params = {
  file: "fixture.ts",
  target: "promise.then",
  name: "thenFn",
  expectRejection: true,
};

export function main(): void {
  const promise = Promise.resolve(42);
  const result = promise.then((v) => v + 1);
  console.log(result);
}
