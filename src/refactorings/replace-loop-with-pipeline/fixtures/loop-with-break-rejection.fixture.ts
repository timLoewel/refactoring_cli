// No params: loop with break — should refuse (break semantics can't be preserved in pipeline).

export function main(): string {
  const items = [1, 2, 3, 4, 5];
  const result: number[] = [];
  for (const item of items) {
    if (item > 3) break;
    result.push(item);
  }
  return result.join(",");
}
