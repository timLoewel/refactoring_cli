export const params = {
  file: "fixture.ts",
  target: "validate",
  condition: "input.length > 0",
};

function validate(input: string, maxLen: number): void {
  if (input.length === 0) {
    throw new RangeError("input must not be empty");
  }
  if (input.length > maxLen) {
    throw new RangeError("input too long");
  }
}

export function main(): string {
  validate("hello", 10);
  return "valid";
}
