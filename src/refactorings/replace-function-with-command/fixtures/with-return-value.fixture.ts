// Function that returns a value; execute() in the Command captures it.
export const params = {
  file: "fixture.ts",
  target: "multiply",
  className: "MultiplyCommand",
};

function multiply(a: number, b: number): number {
  return a * b;
}

export function main(): string {
  return "command-with-return-ready";
}
