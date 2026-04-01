// No params: mutation of outer let variable — complex return semantics, not yet supported.

export function main(): string {
  const items = [1, 2, 3, 4, 5];
  let sum = 0;
  for (const item of items) {
    sum += item;
  }
  return String(sum);
}
