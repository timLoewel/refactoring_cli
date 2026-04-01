export const params = { file: "fixture.ts", target: "value", name: "outer" };

export function main(): string {
  const value = 10;
  const inner = (() => {
    const value = 20;
    return value;
  })();
  return String(value + inner);
}
