export const params = {
  file: "fixture.ts",
  target: "processValue",
  condition: "value > 0",
};

const results: number[] = [];

function processValue(value: number): void {
  if (value <= 0) {
    throw new Error("value must be positive");
  }
  results.push(value * 2);
}

export function main(): string {
  results.length = 0;
  processValue(5);
  processValue(3);
  return results.join(",");
}
