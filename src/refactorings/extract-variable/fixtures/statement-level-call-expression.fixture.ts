// Extracting a call expression that forms the entire ExpressionStatement is
// useless — the declaration captures the return value but there are no other
// references. The refactoring should reject this instead of producing
// `const v = call(); v;` with a redundant bare reference.

export const params = {
  file: "fixture.ts",
  target: 'track("login")',
  name: "tracked",
  expectRejection: true,
};

const events: string[] = [];

function track(event: string): void {
  events.push(event);
}

export function main(): string {
  track("login");
  return events.join(",");
}
