export const params = { file: "fixture.ts", target: "recordAndReport" };

let totalSaved = 0;

function recordAndReport(amount: number): string {
  totalSaved += amount;
  return `saved: ${totalSaved}`;
}

export function main(): string {
  const result = recordAndReport(42);
  return result;
}
