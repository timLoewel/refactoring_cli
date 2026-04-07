export const params = { file: "fixture.ts", target: "sumAndLog" };

let log: string[] = [];

function sumAndLog(items: number[]): number {
  let total = 0;
  for (const n of items) {
    total += n;
  }
  log.push(`sum: ${total}`);
  return total;
}

export function main(): string {
  log = [];
  const result = sumAndLog([10, 20, 30]);
  return `total: ${result}, log: ${log.join(",")}`;
}
