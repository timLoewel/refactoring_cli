// Regression: split-variable with callback-style code where the variable
// is used after a function call that could modify it via callback.

export const params = {
  file: "fixture.ts",
  target: "acc",
};

export function main(): string {
  let acc = 0;
  acc = acc + 10;
  const first = acc;
  acc = acc * 2;
  const second = acc;
  return String(first + second);
}
