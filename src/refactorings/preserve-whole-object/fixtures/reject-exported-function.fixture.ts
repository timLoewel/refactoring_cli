// An exported function should be rejected because this refactoring
// only updates same-file call sites. Cross-file callers would break.

export const params = {
  file: "fixture.ts",
  target: "calculate",
  expectRejection: true,
};

export function calculate(a: number, b: number): number {
  return a + b;
}

export function main(): string {
  return String(calculate(3, 4));
}
