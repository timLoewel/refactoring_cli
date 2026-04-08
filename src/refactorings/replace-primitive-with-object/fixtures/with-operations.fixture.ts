export const params = { file: "fixture.ts", target: "score", className: "Score" };

const score: number = 42;

export function main(): string {
  return String(score);
}
