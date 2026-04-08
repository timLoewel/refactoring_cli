// After splitting, bodies still reference the removed flag variable — runtime error.

export const params = {
  file: "fixture.ts",
  target: "renderWidget",
  flag: "compact",
  expectRejection: true,
};

function renderWidget(size: number, compact: boolean): string {
  if (compact) {
    return `[compact:${size}]`;
  }
  return `[full:${size}]`;
}

export function main(): string {
  return renderWidget(20, false);
}
