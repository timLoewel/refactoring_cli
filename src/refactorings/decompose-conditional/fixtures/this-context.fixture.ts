// Regression: decompose-conditional extracts condition and branches
// into named functions for clarity.

export const params = {
  file: "fixture.ts",
  target: "10",
};

function format(value: number): string {
  if (value > 100) {
    console.log("large");
  } else {
    console.log("small");
  }
  return String(value);
}

export function main(): string {
  return format(150) + "," + format(50);
}
