export const params = { file: "fixture.ts", target: "name", name: "label" };

export function main(): string {
  const name = "Tim";
  const obj = { name: "Alice" };
  return name + obj.name;
}
