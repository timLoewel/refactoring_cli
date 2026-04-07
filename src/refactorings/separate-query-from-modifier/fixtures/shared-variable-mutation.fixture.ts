// No params: shared variable (count) is mutated in the same statement block that
// contains external side effects (log.push) — cannot safely separate without
// duplicating side effects. Precondition should reject.

let log: string[] = [];

function collectAndCount(items: string[]): number {
  let count = 0;
  for (const item of items) {
    log.push(item);
    count++;
  }
  return count;
}

export function main(): string {
  log = [];
  const count = collectAndCount(["a", "b", "c"]);
  return `count: ${count}, log: ${log.join(",")}`;
}
