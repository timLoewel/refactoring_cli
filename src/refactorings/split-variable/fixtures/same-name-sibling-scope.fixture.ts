export const params = { file: "fixture.ts", target: "x" };

function first(): string {
  let x = 1;
  x = 2;
  return String(x);
}

function second(): string {
  let x = 10;
  return String(x);
}

export function main(): string {
  return first() + "," + second();
}
