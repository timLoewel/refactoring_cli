// Documents behavior: extracting "a + b" also replaces the sub-expression in "a + b + c"
// since AST parses left-associatively: (a + b) + c has "a + b" as a sub-node.
export const params = { file: "fixture.ts", target: "a + b", name: "sum" };

export function main(): string {
  const a = 1;
  const b = 2;
  const c = 3;
  const x = a + b;
  const y = a + b + c;
  return String(x + y);
}
