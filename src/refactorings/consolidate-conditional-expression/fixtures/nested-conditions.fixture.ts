// No params: the implementation only consolidates consecutive sibling
// if-statements at the same block level using ||. Nested if-statements
// (producing && semantics) are not supported by this refactoring.

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
