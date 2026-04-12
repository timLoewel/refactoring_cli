// Extracting from a class field initializer places the variable at module scope,
// where `this` is undefined. Class bodies cannot contain const statements,
// so extraction from property initializers must be rejected.
export const params = {
  file: "fixture.ts",
  target: "this.greet",
  name: "fn",
  expectRejection: true,
};

class Greeter {
  greet(): string {
    return "hello";
  }
  /** @deprecated Use greet() instead */
  sayHello = this.greet;
}

export function main(): string {
  return new Greeter().sayHello();
}
