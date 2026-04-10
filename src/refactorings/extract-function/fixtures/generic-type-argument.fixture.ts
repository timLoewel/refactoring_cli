export const params = {
  file: "fixture.ts",
  startLine: 10,
  endLine: 10,
  name: "createMap",
};

export function main(): string {
  function process<T>(value: T): string {
    const map = new Map<string, T>();
    map.set("key", value);
    return String(map.size);
  }
  return process(42);
}
