export const params = { file: "fixture.ts", target: "start", name: "__reftest__" };

const startsWith =
  <input, const start extends string>(start: start): ((value: unknown) => boolean) =>
  (value) =>
    typeof value === "string" && value.startsWith(start);

export function main(): boolean {
  return startsWith("Hello")("Hello, World");
}
