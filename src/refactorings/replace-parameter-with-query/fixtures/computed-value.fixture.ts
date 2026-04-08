// Self-referential block-scoped declaration bug (TS2448).

export const params = {
  file: "fixture.ts",
  target: "format",
  param: "multiplier",
  expectRejection: true,
};

const BASE = 10;

function format(value: number, multiplier: number): string {
  return `${value * multiplier}`;
}

export function main(): string {
  const doubled = BASE * 2;
  return format(BASE, doubled);
}
