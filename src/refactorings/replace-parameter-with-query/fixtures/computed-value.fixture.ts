// No params: the implementation inserts `const <param> = <param> as unknown as <type>`
// which is a self-referential block-scoped declaration (TS2448) and fails compilation.
// The fixture below shows the intended before-state: a parameter that could be derived
// from another argument and removed.

const BASE = 10;

function format(value: number, multiplier: number): string {
  return `${value * multiplier}`;
}

export function main(): string {
  const doubled = BASE * 2;
  return format(BASE, doubled);
}
