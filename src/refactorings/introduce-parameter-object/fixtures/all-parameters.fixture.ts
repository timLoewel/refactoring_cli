// All parameters grouped into a single object. main() does not call the
// refactored function so it stays valid before and after.
export const params = {
  file: "fixture.ts",
  target: "createRect",
  params: "x,y",
  objectName: "origin",
};

function createRect(x: number, y: number): string {
  return `(${x},${y})`;
}

export function main(): string {
  return "param-object-ready";
}
