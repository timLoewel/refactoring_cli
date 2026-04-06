export const params = { file: "fixture.ts", target: "8" };

const log: string[] = [];

export function main(): string {
  const threshold = 10;
  const value = 15;
  if (value > threshold) {
    log.push("above");
  }
  return log.join(",");
}
