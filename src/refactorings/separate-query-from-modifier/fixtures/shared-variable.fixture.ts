export const params = { file: "fixture.ts", target: "computeAndLog" };

let log: string[] = [];

function computeAndLog(x: number, y: number): number {
  const result = x * y;
  log.push(`computed: ${result}`);
  return result;
}

export function main(): string {
  log = [];
  const value = computeAndLog(3, 7);
  return `value: ${value}, log: ${log.join(",")}`;
}
