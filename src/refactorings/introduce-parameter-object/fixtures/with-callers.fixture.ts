// Callers of the function are also in the file but main() is independent.
export const params = {
  file: "fixture.ts",
  target: "makePoint",
  params: "x,y",
  objectName: "coords",
};

function makePoint(x: number, y: number): string {
  return `${x}:${y}`;
}

export function main(): string {
  return "callers-ready";
}
