// Renaming should be rejected when the target name maps to multiple
// declaration sites (e.g. a local variable AND a parameter in a sibling
// function). findNameNode returns the first match, making the rename
// ambiguous — the caller cannot control which declaration gets renamed.

export const params = {
  file: "fixture.ts",
  target: "predicate",
  name: "guard",
  expectRejection: true,
};

function filterItems(items: number[], fn: (x: number) => boolean): number[] {
  let predicate = fn;
  return items.filter(predicate);
}

function applyPredicate(predicate: (x: number) => boolean, items: number[]): boolean {
  return items.every(predicate);
}

export function main(): string {
  const filtered = filterItems([1, 2, 3, 4, 5], (x) => x > 2);
  const allPositive = applyPredicate((x) => x > 0, [1, 2, 3]);
  return `${filtered.join(",")}:${allPositive}`;
}
