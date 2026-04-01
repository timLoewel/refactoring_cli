// Inline code is replaced with an existing function call.
// The existing function uses a different (but equivalent) internal implementation.
export const params = {
  file: "fixture.ts",
  target: "[1, 2, 3].length",
  name: "listSize",
};

const LIST = [1, 2, 3];

function listSize(): number {
  return LIST.length;
}

export function main(): string {
  const size = [1, 2, 3].length;
  return String(size);
}
