export const params = { file: "fixture.ts", target: "originalMethod", expectRejection: true };

// Mirrors class-transformer's TransformPlainToInstance decorator pattern:
// originalMethod captures descriptor.value before it's overwritten with a wrapper.
// Inlining would replace originalMethod.apply(this, args) with descriptor.value.apply(this, args)
// inside the wrapper — causing infinite recursion since descriptor.value now points to the wrapper.
function decorate(descriptor: { value: (...args: number[]) => number }): void {
  const originalMethod = descriptor.value;
  descriptor.value = function (...args: number[]): number {
    return originalMethod.apply(null, args) + 1;
  };
}

export function main(): number {
  const obj = { value: (x: number) => x * 2 };
  decorate(obj);
  return obj.value(21);
}
