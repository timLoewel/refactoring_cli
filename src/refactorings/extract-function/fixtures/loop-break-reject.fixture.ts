// No params: break inside extraction range refers to outer loop — precondition error.

export function main(): string {
  const items = [1, 2, 3, -1, 5];
  for (const item of items) {
    if (item < 0) break;
  }
  return "done";
}
