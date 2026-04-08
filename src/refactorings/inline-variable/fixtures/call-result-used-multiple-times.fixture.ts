// Call-expression initializer used multiple times must be rejected.
// Inlining `result` would call transform() 3 times instead of 1,
// changing side-effect count and potentially returning different values each time.

export const params = {
  file: "fixture.ts",
  target: "result",
  expectRejection: true,
};

let callCount = 0;

class Wrapper {
  constructor(public value: number) {}
}

function transform(n: number): number | Wrapper {
  callCount++;
  return n > 0 ? new Wrapper(n) : n * 2;
}

export function main(): string {
  const result = transform(5);
  const output = result instanceof Wrapper ? result.value : result;
  return String(output) + "," + String(callCount);
}
