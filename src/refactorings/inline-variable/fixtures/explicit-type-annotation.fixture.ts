// Inlining a variable with an explicit type annotation must preserve the
// annotation via a type assertion (`as T`), otherwise the inlined expression
// may lose type information (e.g. `any` widening that suppresses errors).
export const params = {
  file: "fixture.ts",
  target: "result",
};

function safeParse(input: string): { success: true; data: number } | { success: false; error: { messages: string[] } } {
  const n = Number(input);
  if (isNaN(n)) return { success: false, error: { messages: ["not a number"] } };
  return { success: true, data: n };
}

export function main(): number {
  const result: any = safeParse("42");
  return result.data;
}
