export const params = { file: "fixture.ts", target: "5" };

export function main(): string {
  const score = 45;
  if (score < 0) return "invalid";
  if (score > 100) return "invalid";
  return `score: ${score}`;
}
