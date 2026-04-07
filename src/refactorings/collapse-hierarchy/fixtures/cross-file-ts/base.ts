export class Shape {
  name: string;
  constructor(name: string) {
    this.name = name;
  }
  describe(): string {
    return `Shape: ${this.name}`;
  }
}

export class Circle extends Shape {
  // Empty subclass — candidate for collapse
}
