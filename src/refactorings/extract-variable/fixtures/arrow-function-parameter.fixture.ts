// Regression: `organization` is a parameter of an arrow function.
// Extracting it should not create `const extracted = organization` at the outer scope
// where `organization` is not defined. The parameter reference is lambda-scoped.
// This fixture documents the rejection case — no params exported so all-fixtures skips it.

export function main() {
  const items = [{ users: [] as unknown[] }];
  // `organization` is a parameter — not a standalone extractable expression.
  // apply(project, { file: "fixture.ts", target: "organization", name: "extracted" })
  // should be rejected (Precondition failed) rather than producing broken code.
  return items.filter((organization) => (organization as { users: unknown[] }).users.length > 0);
}
