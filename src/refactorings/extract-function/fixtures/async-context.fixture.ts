// Extraction within async context — produces broken type annotation.

export const params = {
  file: "fixture.ts",
  startLine: 15,
  endLine: 15,
  name: "processData",
  expectRejection: true,
};

async function fetchData(): Promise<string> {
  return "data";
}

async function run(): Promise<string> {
  const result = await fetchData();
  return result.slice(0, 4);
}

export function main(): string {
  // Verify the sync wrapper — run() is exercised structurally by the refactoring
  // but main() returns a deterministic value for the test harness.
  return "data";
}
