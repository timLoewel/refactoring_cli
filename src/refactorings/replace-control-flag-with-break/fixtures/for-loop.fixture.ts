export const params = { file: "fixture.ts", target: "done" };

export function main(): string {
  const values = [1, 2, 3, 99, 4];
  let found = -1;
  let done = false;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v !== undefined && v > 10) {
      found = v;
      done = true;
    }
  }
  return String(found);
}
