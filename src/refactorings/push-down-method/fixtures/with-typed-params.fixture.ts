export const params = {
  file: "fixture.ts",
  target: "Shape",
  method: "area",
  subclass: "Rectangle",
};

class Shape {
  color: string = "red";
  area(width: number, height: number): number {
    return width * height;
  }
}

class Rectangle extends Shape {
  width: number = 4;
  height: number = 5;
}

export function main(): string {
  const rect = new Rectangle();
  return `area=${rect.area(rect.width, rect.height)} color=${rect.color}`;
}
