export const params = { file: "fixture.ts", target: "score > 60", name: "isPassing" };

export function main(): string {
  const score = 75;
  if (score > 60) {
    return "pass";
  }
  return "fail";
}
