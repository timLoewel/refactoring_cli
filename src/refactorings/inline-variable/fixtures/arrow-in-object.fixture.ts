// Bug: inline-variable crashes with "syntax error inserted" when inlining
// a variable that holds an object spread into a return statement,
// producing invalid syntax like `return { matched, {} }`.

export const params = {
  file: "fixture.ts",
  target: "selections",
};

export function main(): string {
  function process(matched: boolean): { matched: boolean; keys: string[] } {
    const selections = { keys: ["a", "b"] };
    return { matched, ...selections };
  }
  const result = process(true);
  return String(result.matched) + "," + result.keys.join("");
}
