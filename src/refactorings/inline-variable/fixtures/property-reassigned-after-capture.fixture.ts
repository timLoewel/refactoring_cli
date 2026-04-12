export const params = { file: "fixture.ts", target: "original", expectRejection: true };

export function main(): number {
  const descriptor = {
    value: (x: number) => x * 2,
  };
  const original = descriptor.value;
  descriptor.value = (...args: number[]) => original(args[0]) + 1;
  return descriptor.value(21);
}
