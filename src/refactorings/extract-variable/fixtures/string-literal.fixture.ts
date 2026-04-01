export const params = { file: "fixture.ts", target: '"application/json"', name: "JSON_MIME" };

export function main(): string {
  const a = "application/json";
  const b = "application/json";
  return a === b ? "match" : "no";
}
