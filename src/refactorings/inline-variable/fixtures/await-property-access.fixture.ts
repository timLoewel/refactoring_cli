export const params = { file: "fixture.ts", target: "result" };

async function fetchData(): Promise<{ value: number }> {
  return { value: 42 };
}

export async function main(): Promise<string> {
  const result = await fetchData();
  return String(result.value);
}
