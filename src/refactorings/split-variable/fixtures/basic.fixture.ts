export const params = { file: "fixture.ts", target: "temp" };

export function main(): string {
  let temp = 10 * 5;
  const area = temp;
  temp = 10 + 5;
  const perimeter = temp;
  return String(area + perimeter);
}
