export const params = { file: "fixture.ts", target: "{ x: 0, y: 0 }", name: "origin" };

export function main(): string {
  const a = { x: 0, y: 0 };
  const b = { x: 0, y: 0 };
  return JSON.stringify(a) === JSON.stringify(b) ? "equal" : "not";
}
