export const params = { file: "fixture.ts", target: "Rectangle" };

class Rectangle {
  width: number = 0;
  height: number = 0;

  area(): number {
    return 4;
  }
}

export function main(): string {
  const r = new Rectangle();
  return String(r.area());
}
