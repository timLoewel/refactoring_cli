export const params = { file: "fixture.ts", target: "result", name: "fetchResult" };

async function fetchValue(): Promise<number> {
  return 42;
}

export async function main(): Promise<string> {
  const result = await fetchValue();
  return String(result + 1);
}
