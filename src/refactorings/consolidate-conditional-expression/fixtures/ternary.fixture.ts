// No params: the implementation targets if-statements (SyntaxKind.IfStatement),
// not ternary expressions. Ternary consolidation is not supported.

function classify(n: number): string {
  return n < 0 ? "negative" : n === 0 ? "zero" : "positive";
}

export function main(): string {
  return `${classify(-1)},${classify(0)},${classify(1)}`;
}
