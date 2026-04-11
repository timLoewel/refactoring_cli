// Inlining a variable used for discriminated-union narrowing would break
// TypeScript's control-flow type analysis, producing type errors in the
// narrowed branches.
export const params = {
  file: "fixture.ts",
  target: "action",
  expectRejection: true,
};

type Action =
  | { type: "greet"; message: string }
  | { type: "add"; a: number; b: number };

export function main(): string {
  const data: { action: Action | null } = { action: { type: "greet", message: "hello" } };
  const action = data.action || { type: "add" as const, a: 0, b: 0 };
  if (action.type === "greet") {
    return action.message;
  }
  return String(action.a + action.b);
}
