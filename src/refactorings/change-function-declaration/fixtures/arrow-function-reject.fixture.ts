// No params: arrow function variable — precondition rejects (not a FunctionDeclaration).

const double = (x: number): number => x * 2;

export function main(): string {
  return String(double(5));
}
