export const params = {
  file: "fixture.ts",
  target: "describeList",
  query: "items.length",
  paramName: "count",
};

const items = ["a", "b", "c"];

function describeList(label: string): string {
  return label + ": " + String(items.length);
}

export function main(): string {
  return describeList("size");
}
