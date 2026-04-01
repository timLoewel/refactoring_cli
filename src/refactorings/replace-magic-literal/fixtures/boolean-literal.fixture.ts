// The implementation handles NumericLiteral and StringLiteral.
// This demonstrates replacing a numeric magic literal used as a threshold.
export const params = { file: "fixture.ts", target: "100", name: "MAX_SCORE" };

export function main(): string {
  const threshold = 100;
  return String(threshold);
}
