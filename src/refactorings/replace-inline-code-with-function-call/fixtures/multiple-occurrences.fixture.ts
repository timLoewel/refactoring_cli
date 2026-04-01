// Same inline pattern appears twice; both occurrences get replaced.
export const params = {
  file: "fixture.ts",
  target: "[10, 20, 30].length",
  name: "itemCount",
};

const ITEMS = [10, 20, 30];

function itemCount(): number {
  return ITEMS.length;
}

export function main(): string {
  const a = [10, 20, 30].length;
  const b = [10, 20, 30].length;
  return `${a},${b}`;
}
