// Field already exists in subclass — precondition refusal.

export const params = {
  file: "fixture.ts",
  target: "Shape",
  field: "color",
  subclass: "Circle",
  expectRejection: true,
};

class Shape {
  color: string = "red";
}

class Circle extends Shape {
  override color: string = "blue";
  radius: number = 5;
}

export function main(): string {
  const c = new Circle();
  return `${c.color} circle with radius ${c.radius}`;
}
