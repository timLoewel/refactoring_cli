function setup(): void {
  // existing setup
}

const configA = "alpha";
const configB = "beta";

export function main(): string {
  setup();
  return `${configA}-${configB}`;
}
