// No params: return expression references local variable from side-effect statements — precondition error

let counter = 0;

function processAndGet(items: string[]): number {
  const total = items.length;
  counter += total;
  return total;
}

export function main(): string {
  counter = 0;
  return String(processAndGet(["a", "b"]));
}
