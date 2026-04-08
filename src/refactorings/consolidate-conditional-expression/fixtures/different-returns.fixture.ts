// Adjacent if statements with DIFFERENT return expressions must NOT be
// consolidated. Merging them would use the first return for all conditions.

export const params = {
  file: "fixture.ts",
  target: "6",
  expectRejection: true,
};

function classify(n: number): string {
  // Line 6: first if
  if (n < 0) return "negative";
  if (n === 0) return "zero";
  return "positive";
}

export function main(): string {
  return [classify(-1), classify(0), classify(1)].join(",");
}
