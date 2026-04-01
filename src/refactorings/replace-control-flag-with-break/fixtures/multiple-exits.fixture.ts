export const params = { file: "fixture.ts", target: "go" };

export function main(): string {
  const data = [10, 20, -1, 30];
  let sum = 0;
  let go = true;
  let i = 0;
  while (go) {
    const n = data[i];
    if (n === undefined) {
      go = false;
    } else if (n < 0) {
      go = false;
    } else {
      sum += n;
      i++;
    }
  }
  return String(sum);
}
