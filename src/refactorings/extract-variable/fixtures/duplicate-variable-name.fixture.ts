// Regression: extracting a variable with a name that already exists at the
// same scope level causes "Cannot redeclare block-scoped variable" errors.
// The refactoring should reject when the chosen name conflicts.
export const params = {
  file: "fixture.ts",
  target: '"saturday"',
  name: "extracted",
  expectRejection: true,
};

const extracted = "seven";
const months = { narrow: [extracted] as const };
const days = { wide: ["saturday"] as const };

export function main(): string {
  return `${months.narrow[0]}-${days.wide[0]}`;
}
