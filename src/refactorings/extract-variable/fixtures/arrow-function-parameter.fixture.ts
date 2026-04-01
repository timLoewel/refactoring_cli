// Regression: `organization` is a parameter of an arrow function.
// Extracting it should not create `const extracted = organization` at the outer scope
// where `organization` is not defined. The parameter reference is lambda-scoped.
// If the only occurrence is as an arrow parameter reference, preconditions/apply should reject it.
export const params = { file: "fixture.ts", target: "organization", name: "extracted" };

export function main() {
  const items = [{ users: [] }];
  // `organization` is a parameter — not a standalone extractable expression
  return items.filter((organization) => organization.users.length > 0);
}
