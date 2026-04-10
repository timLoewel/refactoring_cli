// Variable initialized to [] then mutated via .push() acts as a mutable accumulator.
// Inlining would replace each reference with a fresh [], losing accumulated state
// and causing a TypeScript error (never[] type inference on bare []).

export const params = {
  file: "fixture.ts",
  target: "items",
  expectRejection: true,
};

export function main(): string {
  const items: string[] = [];
  for (const x of ["a", "b", "c"]) {
    items.push(x);
  }
  return items.join(",");
}
