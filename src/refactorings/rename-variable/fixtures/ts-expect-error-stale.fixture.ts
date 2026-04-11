export const params = { file: "fixture.ts", target: "result", name: "output" };

// @ts-expect-error - stale directive on a valid line
const flag = true;

export function main(): string {
  const result = flag ? 42 : 0;
  return String(result);
}
