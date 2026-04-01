export const params = {
  file: "fixture.ts",
  target: "findFirst",
  newBody: "{ for (const item of items) { if (predicate(item)) return item; } return undefined; }",
};

function findFirst(items: number[], predicate: (x: number) => boolean): number | undefined {
  let result: number | undefined = undefined;
  for (let i = 0; i < items.length; i++) {
    if (predicate(items[i] as number) && result === undefined) {
      result = items[i];
    }
  }
  return result;
}

export function main(): string {
  const val = findFirst([3, 1, 4, 1, 5], (x) => x > 2);
  return String(val);
}
