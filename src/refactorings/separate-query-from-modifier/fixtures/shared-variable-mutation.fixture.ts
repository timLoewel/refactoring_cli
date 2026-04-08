// Shared variable mutation interleaved with side effects — precondition should reject.

export const params = { file: "fixture.ts", target: "collectAndCount", expectRejection: true };

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
