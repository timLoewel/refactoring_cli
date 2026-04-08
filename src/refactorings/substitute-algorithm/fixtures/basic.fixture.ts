export const params = {
  file: "fixture.ts",
  target: "sortItems",
  newBody: "{ return [...items].sort(); }",
};

export function main(): string {
  const items = ["banana", "apple", "cherry"];
  const sorted = sortItems(items);
  return sorted.join(", ");
}

function sortItems(items: string[]): string[] {
  const result: string[] = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item !== undefined) {
      result.push(item);
    }
  }
  result.sort();
  return result;
}
