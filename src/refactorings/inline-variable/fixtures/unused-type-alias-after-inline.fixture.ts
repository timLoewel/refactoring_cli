// When a local type alias is only used as the type annotation on the inlined
// variable, removing the declaration orphans the type alias. Projects with
// noUnusedLocals report "'X' is declared but never used." The refactoring
// must clean up orphaned type declarations (including nested ones in
// callbacks or test blocks) and cascade to types they reference.
export const params = {
  file: "fixture.ts",
  target: "items",
};

type Item = { count: number; name: string };
type Items = Item[];

export function main(): string {
  const items: Items = [
    { count: 1, name: "potato" },
    { count: 10, name: "waffles" },
  ];
  const found = items.find((x) => x.count > 5);
  return found ? found.name : "none";
}
