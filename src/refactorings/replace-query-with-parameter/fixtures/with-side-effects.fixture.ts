export const params = {
  file: "fixture.ts",
  target: "generateToken",
  query: "Math.random().toString(36).slice(2)",
  paramName: "randomPart",
};

function generateToken(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2)}`;
}

export function main(): string {
  const token = generateToken("user");
  return token.startsWith("user-") ? "ok" : "fail";
}
