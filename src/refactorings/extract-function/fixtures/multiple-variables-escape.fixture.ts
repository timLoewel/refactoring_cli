export const params = {
  file: "fixture.ts",
  startLine: 9,
  endLine: 10,
  name: "parseInput",
};

export function main(): string {
  const parts = "Alice,30".split(",");
  const name = parts[0]!;
  const age = parseInt(parts[1]!);
  return `${name} is ${age}`;
}
