export const params = {
  file: "fixture.ts",
  target: "process",
  startLine: 10,
  endLine: 11,
  expectRejection: true,
};

function process(): void {
  // does something
}

const base = 10;
const result = base * 2;

export function main(): string {
  return String(result);
}
