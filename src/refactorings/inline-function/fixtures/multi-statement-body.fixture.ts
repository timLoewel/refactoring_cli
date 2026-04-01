// No params: multi-statement non-void body called in expression position — precondition error.

function process(x: number): number {
  const doubled = x * 2;
  const incremented = doubled + 1;
  return incremented;
}

export function main(): string {
  const result = process(5);
  return String(result);
}
