export const params = {
  file: "fixture.ts",
  target: "config.nested?.values",
  name: "extracted",
};

interface Nested {
  values: number[];
}

interface Config {
  nested?: Nested;
}

// Extracting `config.nested?.values` (an optional-chain prefix whose value is
// `number[] | undefined`) must preserve the short-circuit on the continuing
// `[1]` access — i.e. produce `extracted?.[1]`, not `extracted[1]` (which would
// be a "possibly undefined" type error and change runtime semantics).
export function main(): string {
  const config: Config = { nested: { values: [10, 20, 30] } };
  const first = config.nested?.values[1];
  return String(first);
}
