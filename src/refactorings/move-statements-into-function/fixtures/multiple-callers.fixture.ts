// Top-level statements (lines 10-11) get moved into the existing function.
// main() output is independent of the moved statements.
export const params = {
  file: "fixture.ts",
  target: "setup",
  startLine: 10,
  endLine: 11,
};

const x = 1;
const y = 2;

function setup(): void {
  // initializes environment
}

export function main(): string {
  setup();
  return "setup-done";
}
