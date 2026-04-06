// No params: flag is read after the loop — precondition error

export function main(): string {
  const items = [1, 2, 3, 4, 5];
  let found = false;
  for (const item of items) {
    if (item === 3) {
      found = true;
    }
  }
  if (found) {
    return "found";
  }
  return "not found";
}
