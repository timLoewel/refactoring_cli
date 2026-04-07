export const params = {
  file: "fixture.ts",
  target: "doubled",
  name: "getDoubled",
};

export function main(): string {
  function process<T extends number>(value: T): string {
    const doubled = value * 2;
    return String(doubled);
  }

  return process(21 as number);
}
