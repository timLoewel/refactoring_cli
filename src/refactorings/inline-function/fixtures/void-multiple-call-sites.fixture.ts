export const params = { file: "fixture.ts", target: "log" };

const messages: string[] = [];

function log(msg: string): void {
  messages.push(msg);
}

export function main(): string {
  log("start");
  log("middle");
  log("end");
  return messages.join(",");
}
