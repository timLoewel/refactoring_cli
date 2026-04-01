export const params = {
  file: "fixture.ts",
  target: "buildReport",
  firstPhaseName: "gatherData",
  secondPhaseName: "emitReport",
};

const output: string[] = [];

function buildReport(title: string): void {
  output.push(`data:${title}`);
  output.push(`report:${title.toLowerCase()}`);
}

export function main(): string {
  output.length = 0;
  buildReport("Sales");
  return output.join("|");
}
