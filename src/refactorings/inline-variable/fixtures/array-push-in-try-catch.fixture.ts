export const params = { file: "fixture.ts", target: "results", expectRejection: true };

export function main(): string[] {
  const results = [];
  try {
    results.push("success");
  } catch (err) {
    results.push("fail");
  }
  return results;
}
