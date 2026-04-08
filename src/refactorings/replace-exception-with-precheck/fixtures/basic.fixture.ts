export const params = { file: "fixture.ts", target: "sqrt", condition: "value >= 0" };

export function main(): string {
  try {
    const result = sqrt(16);
    return `sqrt: ${result}`;
  } catch (e) {
    return "error";
  }
}

function sqrt(value: number): number {
  if (value < 0) {
    throw new Error("Cannot take sqrt of negative number");
  }
  return Math.sqrt(value);
}
