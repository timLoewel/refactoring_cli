export const params = {
  file: "fixture.ts",
  startLine: 11,
  endLine: 12,
  name: "logMessages",
};

const log: string[] = [];

export function main(): string {
  log.push("hello");
  log.push("world");
  log.push("end");
  return log.join(",");
}
