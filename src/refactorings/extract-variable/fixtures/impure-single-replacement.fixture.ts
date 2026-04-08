// When the target expression contains a function call, only the first
// occurrence should be replaced. Multiple occurrences may depend on
// state changes between them (e.g. mocked time, counter increments).

export const params = {
  file: "fixture.ts",
  target: "counter()",
  name: "count",
};

let n = 0;
function counter(): number {
  return ++n;
}

export function main(): string {
  const a = counter();
  const b = counter();
  return `${a},${b}`;
}
