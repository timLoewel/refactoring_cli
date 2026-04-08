// The trailing return statement must remain AFTER the guard clauses.
// Previously, non-if statements were placed before guards, causing
// the trailing return to short-circuit the entire function.

export const params = {
  file: "fixture.ts",
  target: "compare",
};

function compare(a: number, b: number): number {
  const diff = a - b;

  if (diff < 0) return -1;
  else if (diff > 0) return 1;

  return diff;
}

export function main(): string {
  return [compare(1, 2), compare(2, 1), compare(2, 2)].join(",");
}
