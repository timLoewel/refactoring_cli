// Regression: variable assigned inside a nested block (loop body) but
// read outside that block. Splitting would create a const in the inner
// scope invisible to the outer reference — must reject.

export const params = { file: "fixture.ts", target: "changed", expectRejection: true };

export function main(): number {
  const items = [1, 2, 3];
  const ret = { a: 0 };
  let changed = false;

  for (const item of items) {
    if (ret.a === 0) {
      ret.a = item;
      changed = true;
    }
  }

  if (changed) {
    return ret.a;
  }
  return 0;
}
