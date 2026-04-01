export const params = { file: "fixture.ts", target: "greet", name: "welcome" };

// A local variable in an inner scope shares the function name.
// The refactoring renames all matching identifiers; the shadowed local
// gets renamed too, but semantics are preserved within that scope.

function greet(): string {
  return "hello";
}

function withLocal(): string {
  const greet = "direct"; // shadows outer function
  return greet;
}

export function main(): string {
  return greet() + "|" + withLocal();
}
