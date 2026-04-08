// Ternary consolidation is not supported — only if-statements.

export const params = { file: "fixture.ts", target: "5", expectRejection: true };

function classify(n: number): string {
  return n < 0 ? "negative" : n === 0 ? "zero" : "positive";
}

export function main(): string {
  return `${classify(-1)},${classify(0)},${classify(1)}`;
}
