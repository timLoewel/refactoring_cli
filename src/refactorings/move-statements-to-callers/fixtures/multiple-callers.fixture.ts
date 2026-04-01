export const params = { file: "fixture.ts", target: "greet" };

const log: string[] = [];

function greet(name: string): void {
  log.push(`hello,${name}`);
  log.push("done");
}

export function main(): string {
  log.length = 0;
  greet("alice");
  greet("bob");
  return log.join(";");
}
