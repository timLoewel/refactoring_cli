// No params: async function with await — multi-statement body, complex to inline.

async function delay(ms: number): Promise<string> {
  await new Promise((resolve) => setTimeout(resolve, ms));
  return "done";
}

export async function main(): Promise<string> {
  const result = await delay(0);
  return result;
}
