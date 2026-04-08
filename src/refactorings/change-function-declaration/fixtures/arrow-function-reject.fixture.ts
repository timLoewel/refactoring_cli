// Arrow function variable — precondition rejects (not a FunctionDeclaration).

export const params = {
  file: "fixture.ts",
  target: "double",
  name: "doubleValue",
  expectRejection: true,
};

const double = (x: number): number => x * 2;

export function main(): string {
  return String(double(5));
}
