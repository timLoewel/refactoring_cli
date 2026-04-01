// No params: this fixture documents a case where replace-query-with-parameter
// would change evaluation order. The query `Math.random()` produces a different
// value every call — moving it from inside the function to the call site means
// it is now evaluated before the function runs, which alters observable behaviour
// when the function is called multiple times or conditionally.

function generateToken(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2)}`;
}

export function main(): string {
  const token = generateToken("user");
  return token.startsWith("user-") ? "ok" : "fail";
}
