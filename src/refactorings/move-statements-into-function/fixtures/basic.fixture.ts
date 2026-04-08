export const params = { file: "fixture.ts", target: "setup", startLine: 9, endLine: 10 };

const config = { ready: false };

function setup(): void {
  config.ready = true;
}

config.ready = false;
config.ready = true;

export function main(): string {
  setup();
  return `ready: ${config.ready}`;
}
