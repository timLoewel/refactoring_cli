// Renaming should be rejected when the target parameter is in a function
// overload signature (no body).  Overload parameters are type-level
// declarations — renaming has no runtime effect and is not meaningful.

export const params = {
  file: "fixture.ts",
  target: "patternOrKey",
  name: "__reftest__",
  expectRejection: true,
};

function greet(): string;
function greet(patternOrKey: string): string;
function greet(arg?: string): string {
  return arg ?? "world";
}

export function main(): string {
  return greet("hello") + ":" + greet();
}
