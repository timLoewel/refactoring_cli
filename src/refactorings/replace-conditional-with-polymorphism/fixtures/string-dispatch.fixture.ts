export const params = { file: "fixture.ts", target: "getLabel" };

function getLabel(shape: string): string {
  switch (shape) {
    case "circle":
      return "Circle";
    case "square":
      return "Square";
    default:
      throw new Error(`Unknown shape: ${shape}`);
  }
}

export function main(): string {
  return `${getLabel("circle")},${getLabel("square")}`;
}
