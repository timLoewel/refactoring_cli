export function main(): string {
  const numbers = [1, 2, 3, 4, 5, 6];
  let found = -1;
  let searching = true;
  let i = 0;
  while (searching) {
    if (i >= numbers.length) {
      searching = false;
    } else {
      const num = numbers[i];
      if (num !== undefined && num > 4) {
        found = num;
        searching = false;
      }
      i++;
    }
  }
  return String(found);
}
