// Multiple params come from the same source; replaced with the whole object.
// main() is independent so it remains valid before and after.
export const params = { file: "fixture.ts", target: "printDimensions" };

function printDimensions(width: number, height: number): string {
  return `${width}x${height}`;
}

export function main(): string {
  return "whole-object-ready";
}
