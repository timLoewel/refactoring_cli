export const params = { file: "fixture.ts", target: "initialize" };

const events: string[] = [];

function initialize(label: string): void {
  events.push(`start:${label}`);
  events.push("ready");
}

export function main(): string {
  events.length = 0;
  initialize("server");
  return events.join(",");
}
