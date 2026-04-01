export const params = { file: "fixture.ts", target: "acc" };

export function main(): string {
  let acc = 1;
  const a = acc;
  acc = 2;
  const b = acc;
  acc = 3;
  const c = acc;
  return `${a},${b},${c}`;
}
