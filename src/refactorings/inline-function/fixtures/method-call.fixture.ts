// Function used as method on object — precondition error (not all usages are direct calls).

export const params = {
  file: "fixture.ts",
  target: "greet",
  expectRejection: true,
};

function greet(): string {
  return "hello";
}

export function main(): string {
  const obj = { greet };
  const a = greet();
  const b = obj.greet();
  return a + b;
}
