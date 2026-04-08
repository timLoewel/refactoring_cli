// Compound assignment (+=) — precondition error.

export const params = { file: "fixture.ts", target: "temp", expectRejection: true };

export function main(): string {
  let temp = 10;
  temp += 5;
  return String(temp);
}
