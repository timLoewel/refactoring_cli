// No params: after splitting, WhenTrue/WhenFalse bodies still reference the removed
// flag variable by name, causing a ReferenceError at runtime. The fixture below
// shows a function with two boolean flags, where one would be removed.

function formatValue(value: number, asPercent: boolean, withSign: boolean): string {
  const base = asPercent ? `${value}%` : `${value}`;
  return withSign && value > 0 ? `+${base}` : base;
}

export function main(): string {
  const a = formatValue(42, true, false);
  const b = formatValue(42, false, true);
  return `${a} | ${b}`;
}
