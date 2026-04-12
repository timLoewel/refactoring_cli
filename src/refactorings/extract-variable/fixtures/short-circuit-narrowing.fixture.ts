export const params = {
  file: "fixture.ts",
  target: "v > max",
  name: "__reftest__",
  expectRejection: true,
};

function getMax(values: number[]): number | null {
  let max: number | null = null;
  for (const v of values) {
    if (max === null || v > max) max = v;
  }
  return max;
}

export function main(): string {
  return String(getMax([3, 1, 5, 2]));
}
