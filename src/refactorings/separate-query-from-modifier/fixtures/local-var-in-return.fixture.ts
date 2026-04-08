export const params = { file: "fixture.ts", target: "processAndGet" };

let counter = 0;

function processAndGet(items: string[]): number {
  const total = items.length;
  counter += total;
  return total;
}

export function main(): string {
  counter = 0;
  return String(processAndGet(["a", "b"]));
}
