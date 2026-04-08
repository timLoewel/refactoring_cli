// Dependency violation: no data-flow analysis, sliding past dependency causes runtime error.

export const params = { file: "fixture.ts", target: 5, destination: 4, expectRejection: true };

const a = 1;
const b = a + 1;
const c = a + b;

export function main(): string {
  return String(c);
}
