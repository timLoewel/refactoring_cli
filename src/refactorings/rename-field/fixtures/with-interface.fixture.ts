export const params = { file: "fixture.ts", target: "Rectangle", field: "width", name: "breadth" };

interface Shape {
  width: number;
}

class Rectangle implements Shape {
  width: number = 0;
  height: number = 0;
}

export function main(): string {
  const r = new Rectangle();
  r.width = 10;
  r.height = 5;
  return `${r.width}x${r.height}`;
}
