export function main(): string {
  class Shape {
    color: string = "red";
  }

  class Circle extends Shape {
    radius: number;
    constructor(radius: number) {
      super();
      this.radius = radius;
    }
    describe(): string {
      return `Circle with radius ${this.radius}`;
    }
  }

  const circle = new Circle(5);
  return circle.describe();
}
