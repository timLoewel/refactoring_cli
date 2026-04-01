export const params = { file: "fixture.ts", target: "x * 2", name: "doubled" };

export function main(): string {
  const x = 5;
  const result = (() => {
    const inner = x * 2;
    return inner + x * 2;
  })();
  return String(result);
}
