export const params = { file: "fixture.ts", target: "temp" };

export function main(): string {
  let temp = "prefix";
  const label = temp + ": ";
  temp = "suffix";
  const tag = ": " + temp;
  return label + tag;
}
