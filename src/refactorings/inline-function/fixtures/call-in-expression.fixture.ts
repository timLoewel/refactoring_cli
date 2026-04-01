export const params = { file: "fixture.ts", target: "getValue" };

function getValue(): number {
  return 42;
}

export function main(): string {
  const result = getValue() + 1;
  return String(result);
}
