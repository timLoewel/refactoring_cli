export const params = {
  file: "fixture.ts",
  target: "clamp",
  newBody: "{ return Math.min(Math.max(value, min), max); }",
};

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

export function main(): string {
  return [clamp(-5, 0, 10), clamp(5, 0, 10), clamp(15, 0, 10)].join(",");
}
