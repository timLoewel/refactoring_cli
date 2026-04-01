// No params: function throws multiple different exception types; a single
// boolean precondition cannot guard all of them simultaneously.

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
