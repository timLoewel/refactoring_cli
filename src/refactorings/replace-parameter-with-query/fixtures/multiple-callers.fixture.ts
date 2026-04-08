// No params: the implementation inserts `const <param> = <param> as unknown as <type>`
// which is a self-referential block-scoped declaration (TS2448) and fails compilation.
// The fixture below shows the intended before-state: the same function called from
// multiple sites, each passing the same derivable argument.

const RATE = 0.15;

function withTax(price: number, rate: number): number {
  return price + price * rate;
}

export function main(): string {
  const a = withTax(100, RATE);
  const b = withTax(200, RATE);
  const c = withTax(50, RATE);
  return [a, b, c].map(String).join(", ");
}
