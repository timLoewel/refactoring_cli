export const params = { file: "fixture.ts", target: "doubled", name: "getDoubled" };

export function main(): string {
  const doubled = [1, 2, 3].map((n) => n * 2);
  return doubled.join(",");
}
