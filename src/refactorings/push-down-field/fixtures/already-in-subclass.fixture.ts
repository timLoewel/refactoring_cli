// No params: field already exists in subclass — precondition refusal

class Shape {
  color: string = "red";
}

class Circle extends Shape {
  color: string = "blue";
  radius: number = 5;
}

export function main(): string {
  const c = new Circle();
  return `${c.color} circle with radius ${c.radius}`;
}
