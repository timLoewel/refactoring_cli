// After splitting, bodies still reference the removed flag variable — runtime error.

export const params = {
  file: "fixture.ts",
  target: "formatValue",
  flag: "asPercent",
};

function formatValue(value: number, asPercent: boolean, withSign: boolean): string {
  const base = asPercent ? `${value}%` : `${value}`;
  return withSign && value > 0 ? `+${base}` : base;
}

export function main(): string {
  const a = formatValue(42, true, false);
  const b = formatValue(42, false, true);
  return `${a} | ${b}`;
}
