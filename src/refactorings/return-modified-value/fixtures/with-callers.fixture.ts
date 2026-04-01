export const params = {
  file: "fixture.ts",
  target: "appendItem",
};

interface List {
  items: string[];
}

function appendItem(list: List, value: string): void {
  list.items.push(value);
}

export function main(): string {
  let myList: List = { items: [] };
  appendItem(myList, "alpha");
  appendItem(myList, "beta");
  appendItem(myList, "gamma");
  return myList.items.join(", ");
}
