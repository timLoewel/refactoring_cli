export const params = { file: "fixture.ts", target: "key", name: "prop" };

export function main(): string {
  const key = "name";
  const obj: Record<string, string> = { [key]: "value" };
  return obj[key];
}
