export const params = { file: "fixture.ts", target: "items", expectRejection: true };

export function main(): string {
  const items: string[] = [];
  items.push("a");
  items.push("b");
  return items.join(", ");
}
