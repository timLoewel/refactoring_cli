export const params = { file: "fixture.ts", target: "item", name: "element" };

export function main(): string {
  const items = ["a", "b", "c"];
  const result: string[] = [];
  for (const item of items) {
    result.push(item.toUpperCase());
  }
  return result.join(",");
}
