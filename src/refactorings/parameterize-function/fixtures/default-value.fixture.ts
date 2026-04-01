export const params = {
  file: "fixture.ts",
  target: "scale",
  paramName: "factor",
  paramType: "number | undefined",
};

function scale(value: number): number {
  return value * 2;
}

export function main(): string {
  const a = scale(5);
  const b = scale(10);
  return `${a},${b}`;
}
