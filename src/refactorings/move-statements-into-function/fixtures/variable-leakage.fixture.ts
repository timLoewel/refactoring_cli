// No params: the statements declare a variable that is used after the range,
// so moving them into the function would break the outer scope reference.

function process(): void {
  // does something
}

const base = 10;
const result = base * 2;

export function main(): string {
  return String(result);
}
