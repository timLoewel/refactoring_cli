// Combine two related standalone functions into a class.
// main() uses inline computation so it remains valid before and after refactoring.
export const params = {
  file: "fixture.ts",
  target: "computeArea,computePerimeter",
  className: "ShapeCalculator",
};

function computeArea(width: number, height: number): number {
  return width * height;
}

function computePerimeter(width: number, height: number): number {
  return 2 * (width + height);
}

export function main(): string {
  return "shape-calculator-ready";
}
