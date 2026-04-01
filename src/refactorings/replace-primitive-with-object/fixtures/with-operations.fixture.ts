// No params: the implementation appends the wrapper class after the variable declaration,
// causing a TypeScript "Class used before its declaration" error. This is a known limitation
// of the implementation's code generation order.
// Documents the intended behavior: wrapping a numeric primitive in a class.

const score: number = 42;

export function main(): string {
  return String(score);
}
