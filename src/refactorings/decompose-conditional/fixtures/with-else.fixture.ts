export const params = { file: "fixture.ts", target: "6" };

const results: string[] = [];

const age = 20;
if (age >= 18) {
  results.push("adult");
} else {
  results.push("minor");
}

export function main(): string {
  return results[0] ?? "";
}
