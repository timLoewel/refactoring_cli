// Renaming an exported variable would break external consumers that import
// it by name. The precondition should reject this.
export const params = {
  file: "fixture.ts",
  target: "version",
  name: "appVersion",
  expectRejection: true,
};

export const version = "1.0";

export function main(): string {
  return `v${version}`;
}
