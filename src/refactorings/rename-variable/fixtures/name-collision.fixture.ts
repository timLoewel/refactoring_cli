// Renaming a variable to a name that already exists in the file should be
// rejected. ts-morph's rename adds numeric suffixes to resolve collisions
// but doesn't update all references correctly.

export const params = {
  file: "fixture.ts",
  target: "errorFn",
  name: "e",
  expectRejection: true,
};

function tryCall(fn: () => number, errorFn: (err: unknown) => number): number {
  try {
    return fn();
  } catch (e) {
    return errorFn(e);
  }
}

export function main(): string {
  return String(
    tryCall(
      () => {
        throw new Error("boom");
      },
      () => -1,
    ),
  );
}
