// Inlining a variable whose initializer uses `this` into a function expression
// changes the `this` binding. The function expression has its own `this` (undefined
// in strict mode), so `this.value` becomes a runtime error.
export const params = {
  file: "fixture.ts",
  target: "val",
  expectRejection: true,
};

export function main() {
  class Box {
    value = 42;
    get(): number {
      const val = this.value;
      const fn = function () {
        return val;
      };
      return fn();
    }
  }
  return new Box().get();
}
