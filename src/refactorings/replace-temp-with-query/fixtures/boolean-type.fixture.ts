export const params = { file: "fixture.ts", target: "isValid", name: "checkValid" };

export function main(): string {
  const isValid = 100 > 50;
  return isValid ? "pass" : "fail";
}
