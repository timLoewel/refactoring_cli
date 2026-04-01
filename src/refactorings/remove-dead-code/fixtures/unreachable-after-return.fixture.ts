// Dead function (never called) is removed; main() behavior is unchanged.
export const params = { file: "fixture.ts", target: "unusedHelper" };

function unusedHelper(): string {
  return "never called";
}

export function main(): string {
  return "active";
}
