// No params: async function fixture — the fixture runner does not support async main().

async function fetchData(): Promise<string> {
  return "data";
}

export async function main(): Promise<string> {
  const result = await fetchData();
  return result.slice(0, 4);
}
