// When a variable with `T | undefined` type is used as a truthiness guard,
// TypeScript narrows it to `T` inside the if-block. Inlining must not add
// `as T | undefined` because the assertion defeats narrowing, producing
// "Object is possibly 'undefined'" errors inside the guarded block.
export const params = { file: "fixture.ts", target: "items" };

interface Box {
  contents: string[] | undefined;
}

export function main(): number {
  const box: Box = { contents: ["a", "b"] };
  const items: string[] | undefined = box.contents;
  if (items) {
    return items.length;
  }
  return 0;
}
