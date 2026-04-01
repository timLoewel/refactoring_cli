export const params = { file: "fixture.ts", target: "val" };

export function main(): string {
  let val = 10;
  const a = val * 2;
  val = 20;
  const b = val * 2;
  val = 30;
  const c = val * 2;
  return `${a},${b},${c}`;
}
