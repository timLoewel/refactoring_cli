export const params = { file: "fixture.ts", target: "isValid" };

export function main(): string {
  const score = 75;
  const isValid = score > 60;
  if (isValid) {
    return "pass";
  }
  return "fail";
}
