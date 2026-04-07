export const params = {
  file: "fixture.ts",
  startLine: 10,
  endLine: 10,
  name: "computeLength",
};

export function main(): string {
  function wrap<T extends string>(value: T): string {
    const len = value.length;
    return `${value}(${len})`;
  }

  return wrap("hello");
}
