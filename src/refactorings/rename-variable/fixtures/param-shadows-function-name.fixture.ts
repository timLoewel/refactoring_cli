export const params = {
  file: "fixture.ts",
  target: "max",
  name: "__reftest__",
};

function max(x: number, max: number): boolean {
  return x <= max;
}

export function main(): string {
  return String(max(5, 10));
}
