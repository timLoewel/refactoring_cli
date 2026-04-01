export const params = {
  file: "fixture.ts",
  target: "countdown",
  paramName: "label",
  paramType: "string | undefined",
};

function countdown(n: number): string {
  if (n <= 0) return "done";
  return `${n} ${countdown(n - 1)}`;
}

export function main(): string {
  return countdown(3);
}
