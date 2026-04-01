export const params = { file: "fixture.ts", target: "6" };

export function main(): string {
  const items = ["a", "b", "c"];
  const log: string[] = [];
  for (const item of items) {
    const upper = item.toUpperCase();
    log.push(upper);
  }
  return log.join(",");
}
