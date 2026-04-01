// Function with multiple negative error codes.
// main() only exercises the success path (positive n).
export const params = { file: "fixture.ts", target: "parseAge" };

function parseAge(input: string) {
  const n = parseInt(input, 10);
  if (isNaN(n)) return -1;
  if (n < 0) return -2;
  if (n > 150) return -3;
}

export function main(): string {
  const result = parseAge("25");
  return result === undefined ? "ok" : String(result);
}
