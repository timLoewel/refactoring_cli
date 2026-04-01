// No params: const variable — precondition error.
// 'const' variables cannot be reassigned, so there is nothing to split.

export function main(): string {
  const x = 42;
  return String(x);
}
