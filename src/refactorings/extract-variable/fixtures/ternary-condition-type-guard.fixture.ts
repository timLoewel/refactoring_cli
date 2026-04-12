export const params = {
  file: "fixture.ts",
  target: "max != null",
  name: "__reftest__",
  expectRejection: true,
};

function getLatest(max: number | null): Date | null {
  return max != null ? new Date(max) : null;
}

export function main(): string {
  const result = getLatest(42);
  return String(result?.getTime());
}
