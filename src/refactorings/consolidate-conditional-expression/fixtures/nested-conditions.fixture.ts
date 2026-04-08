// Nested if-statements (producing && semantics) are not supported.

export const params = { file: "fixture.ts", target: "6", expectRejection: true };

function isEligible(age: number, hasId: boolean): boolean {
  if (age >= 18) {
    if (hasId) {
      return true;
    }
  }
  return false;
}

export function main(): string {
  return String(isEligible(20, true));
}
