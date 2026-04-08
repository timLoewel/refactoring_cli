export const params = {
  file: "fixture.ts",
  target: "formatLabel",
  paramName: "prefix",
  paramType: "string",
};

function formatLabel(value: number): string {
  return `Value: ${value}`;
}

export function main(): string {
  const a = formatLabel(42);
  const b = formatLabel(100);
  return `${a} | ${b}`;
}
