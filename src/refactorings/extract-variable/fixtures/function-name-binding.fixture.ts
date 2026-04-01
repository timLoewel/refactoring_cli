// Regression: target matches a function declaration binding identifier.
// The function declaration name must NOT be replaced — only call-site references.
export const params = { file: "fixture.ts", target: "double", name: "fn" };

function double(x: number): number {
  return x * 2;
}

export function main(): number {
  return double(5) + double(3);
}
