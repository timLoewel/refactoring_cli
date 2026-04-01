// Combine three transformation steps into one transform function.
// The individual functions remain; only a new wrapper is added.
export const params = {
  file: "fixture.ts",
  functions: "normalize,trim,uppercase",
  name: "processText",
};

function normalize(text: string): void {
  // normalizes in place (side-effect simulated externally)
}

function trim(text: string): void {
  // trims whitespace representation
}

function uppercase(text: string): void {
  // uppercases content
}

export function main(): string {
  normalize("hello");
  trim("hello");
  uppercase("hello");
  return "pipeline-applied";
}
