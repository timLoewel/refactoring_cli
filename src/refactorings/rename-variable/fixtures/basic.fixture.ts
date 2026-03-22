export const params = {
  file: "fixture.ts",
  target: "count",
  name: "value",
};

export function main(): string {
  const count = 42;
  const doubled = count * 2;
  const tripled = count * 3;
  return String(doubled + tripled);
}
