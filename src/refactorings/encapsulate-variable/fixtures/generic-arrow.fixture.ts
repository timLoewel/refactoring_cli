// Bug: encapsulate-variable replaces a const with generic type parameters
// with `let _name: unknown`, losing the generic signature and causing
// "Object is of type 'unknown'" errors at all usage sites.

export const params = {
  file: "fixture.ts",
  target: "identity",
};

const identity = <T>(value: T): T => value;

export function main(): string {
  const num = identity(42);
  const str = identity("hello");
  return String(num) + "," + str;
}
