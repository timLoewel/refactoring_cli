function renderWidget(size: number, compact: boolean): string {
  if (compact) {
    return `[compact:${size}]`;
  }
  return `[full:${size}]`;
}

export function main(): string {
  const a = renderWidget(10, true);
  const b = renderWidget(20, false);
  return `${a} ${b}`;
}
