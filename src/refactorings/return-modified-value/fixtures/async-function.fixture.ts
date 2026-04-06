export const params = { file: "fixture.ts", target: "process" };

async function process(data: { value: number }): Promise<void> {
  data.value = data.value * 2;
}

export async function main(): Promise<string> {
  const obj = { value: 5 };
  await process(obj);
  return String(obj.value);
}
