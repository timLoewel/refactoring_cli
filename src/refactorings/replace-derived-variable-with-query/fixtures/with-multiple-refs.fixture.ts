export const params = { file: "fixture.ts", target: "doubled" };

class NumberBox {
  doubled: number = 2 * 5;
}

export function main(): string {
  const box = new NumberBox();
  return `${box.doubled},${box.doubled}`;
}
