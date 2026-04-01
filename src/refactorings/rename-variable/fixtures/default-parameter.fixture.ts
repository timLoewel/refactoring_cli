export const params = { file: "fixture.ts", target: "fallback", name: "defaultVal" };

export function main(): string {
  const fallback = "unknown";
  const greet = (name: string = fallback): string => `Hello, ${name}`;
  return greet();
}
