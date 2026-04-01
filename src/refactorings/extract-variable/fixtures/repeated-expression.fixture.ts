export const params = { file: "fixture.ts", target: "items.length", name: "count" };

export function main(): string {
  const items = [1, 2, 3, 4];
  const half = Math.floor(items.length / 2);
  const last = items.length - 1;
  return `half=${half}, last=${last}`;
}
