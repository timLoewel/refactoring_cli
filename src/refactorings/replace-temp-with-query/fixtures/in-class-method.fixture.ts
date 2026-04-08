// Extracting a temp that uses `this` requires method extraction, not yet supported.

export const params = {
  file: "fixture.ts",
  target: "area",
  name: "getArea",
  expectRejection: true,
};

class Rectangle {
  constructor(
    public width: number,
    public height: number,
  ) {}

  describe(): string {
    const area = this.width * this.height;
    return `Area: ${area}`;
  }
}

export function main(): string {
  const rect = new Rectangle(3, 4);
  return rect.describe();
}
