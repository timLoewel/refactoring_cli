export const params = { file: "fixture.ts", target: "getPriority" };

function getPriority(level: string): number {
  switch (level) {
    case "low":
      return 1;
    case "medium":
      return 2;
    case "high":
      return 3;
    default:
      throw new Error(`Unknown level: ${level}`);
  }
}

export function main(): string {
  return `${getPriority("low")},${getPriority("medium")},${getPriority("high")}`;
}
