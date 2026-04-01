// No params: compound assignment (+=) — precondition error.
// 'temp += x' implies a dependency on the previous value; cannot be split.

export function main(): string {
  let temp = 10;
  temp += 5;
  return String(temp);
}
