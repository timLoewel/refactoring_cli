// No params: second half references variable declared in first half — precondition error

export function main(): string {
  const items = [1, 2, 3];
  for (const item of items) {
    const doubled = item * 2;
    const result = doubled + 1;
  }
  return "done";
}
