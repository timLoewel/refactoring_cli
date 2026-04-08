// Async function with await — multi-statement body, complex to inline.

export const params = {
  file: "fixture.ts",
  target: "delay",
  expectRejection: true,
};

async function delay(ms: number): Promise<string> {
  await new Promise((resolve) => setTimeout(resolve, ms));
  return "done";
}

async function run(): Promise<string> {
  const result = await delay(0);
  return result;
}

export function main(): string {
  return "done";
}
