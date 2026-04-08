export const params = {
  file: "fixture.ts",
  target: "processData",
  firstPhaseName: "prepareData",
  secondPhaseName: "formatData",
};

function processData(input: string): void {
  console.log(input.trim());
  console.log(input.toUpperCase());
}

export function main(): string {
  processData("  hello world  ");
  return "done";
}
