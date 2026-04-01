// No params: second accumulation depends on first (running total), cannot split independently.

export function main(): string {
  const values = [1, 2, 3, 4];
  let total = 0;
  const running: number[] = [];
  for (const v of values) {
    total += v;
    running.push(total);
  }
  return running.join(",");
}
