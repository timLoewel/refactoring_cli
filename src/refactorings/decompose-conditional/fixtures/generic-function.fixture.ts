export const params = { file: "fixture.ts", target: "7" };

const log: string[] = [];

export function main(): string {
  function process<T extends { name: string }>(item: T): void {
    if (item.name.length > 5) {
      log.push(item.name.toUpperCase());
    }
  }

  log.length = 0;
  process({ name: "Hello World" });
  return log.join(",");
}
