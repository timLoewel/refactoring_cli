// No params exported: side-effect initializer used multiple times is refused by precondition.
// Inlining `rand` at both sites would call getRandom() twice, changing callCount from 1 to 2.

let callCount = 0;
const getRandom = (): number => {
  callCount++;
  return 42;
};

export function main(): string {
  const rand = getRandom();
  const a = rand + 1;
  const b = rand + 2;
  return String(a + b + callCount);
}
