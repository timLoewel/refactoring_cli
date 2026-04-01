export const params = { file: "fixture.ts", target: "6" };

export function main(): string {
  const src = [1, 2, 3];
  const copy: number[] = [];
  for (const item of src) {
    copy.push(item);
  }
  return copy.join(",");
}
