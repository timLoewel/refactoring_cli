export const params = {
  file: "fixture.ts",
  target: "Stack",
  delegateFieldName: "storage",
};

class List {
  label(): string {
    return "list";
  }
  kind(): string {
    return "ordered";
  }
}

class Stack extends List {}

export function main(): string {
  const s = new Stack();
  return `${String(s.label())} (${String(s.kind())})`;
}
