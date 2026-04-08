// Bug: extract-function types parameters as 'unknown' when the variable's type
// comes from narrowing or inference, causing "'X' is of type 'unknown'" errors.

export const params = {
  file: "fixture.ts",
  startLine: 18,
  endLine: 18,
  name: "getEntry",
};

interface Config {
  entries: Record<string, { label: string }>;
}

export function main(): string {
  const config: Config = { entries: { a: { label: "hello" } } };
  const key = "a";
  const result = config.entries[key].label;
  return result;
}
